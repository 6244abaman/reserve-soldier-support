'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const settings=JSON.parse(fs.readFileSync(path.join(root,'app-deployment.json'),'utf8'));
const links={app:settings.app,displayName:settings.displayName,url:settings.review.url,publicDirectory:settings.publicDirectory};
fs.writeFileSync(path.join(root,'app/app-links.json'),JSON.stringify(links,null,2)+'\n');
console.log('Updated public app links from deployment metadata.');
