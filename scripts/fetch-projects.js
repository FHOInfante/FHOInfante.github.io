const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'projects-config.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'projects.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Personal-Website' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        else resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

function normalizeRepo(r, isExternal) {
  return {
    name: r.name,
    description: r.description || '',
    language: r.language || null,
    stars: r.stargazers_count,
    forks: r.forks_count,
    updatedAt: r.updated_at,
    url: r.html_url,
    isExternal: isExternal || false,
  };
}

(async () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const repoSlugs = config.repos || [];
  const manual = config.manualProjects || [];
  let projects = [];
  let failed = [];

  for (const slug of repoSlugs) {
    try {
      console.log(`Fetching: ${slug}`);
      const r = await fetch(`https://api.github.com/repos/${slug}`);
      const isExt = !slug.toLowerCase().startsWith('fhoinfante/');
      projects.push(normalizeRepo(r, isExt));
    } catch (e) {
      console.warn(`Failed to fetch ${slug}: ${e.message}`);
      failed.push(slug);
    }
  }

  for (const m of manual) {
    projects.push({
      name: m.name,
      description: m.description || '',
      language: m.language || null,
      stars: m.stars || 0,
      forks: m.forks || 0,
      updatedAt: m.updatedAt || new Date().toISOString(),
      url: m.url,
      isExternal: false,
    });
  }

  projects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const output = {
    lastUpdated: new Date().toISOString(),
    featured: projects.slice(0, config.featuredCount || 5),
    projects: projects,
    collaborations: config.collaborations || [],
    certificates: config.certificates || [],
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Generated ${OUTPUT_PATH}: ${projects.length} projects`);

  const jsonStr = JSON.stringify(output).replace(/<\//g, '<\\/');
  const embedRe = /(<script id="projects-data" type="application\/json">)(.*?)(<\/script>)/s;
  const htmlFiles = ['index.html', 'portfolio.html', 'about.html'];
  for (const file of htmlFiles) {
    const htmlPath = path.join(__dirname, '..', file);
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const updated = html.replace(embedRe, '$1' + jsonStr + '$3');
    if (updated !== html) {
      fs.writeFileSync(htmlPath, updated, 'utf-8');
      console.log(`Updated ${file}`);
    } else {
      console.log(`Pattern not found in ${file} — using fallback`);
      const fallback = html.replace(/__PROJECTS_JSON__/g, jsonStr);
      if (fallback !== html) {
        fs.writeFileSync(htmlPath, fallback, 'utf-8');
        console.log(`Updated ${file} via fallback`);
      } else {
        console.log(`No placeholder found in ${file}`);
      }
    }
  }
})();
