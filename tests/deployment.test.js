const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('public owner links and frontend proxy match the deployment record',()=>{
  const settings=JSON.parse(fs.readFileSync(path.join(root,'app-deployment.json'),'utf8'));
  const publicLinks=JSON.parse(fs.readFileSync(path.join(root,'app/app-links.json'),'utf8'));
  assert.deepEqual(publicLinks,{app:settings.app,url:settings.review.url,publicDirectory:settings.publicDirectory});
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'app/js/config.js'),'utf8'),context);
  assert.equal(context.window.MOMENTUM_CONFIG.proxyUrl,settings.llm.url);
  for(const file of ['README.md','HOSTING.txt']){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(text.includes(settings.review.url),file+': public URL');
    assert.ok(text.includes(settings.review.dashboardUrl),file+': management URL');
    assert.ok(text.includes(settings.publicDirectory),file+': owner directory');
  }
  const blueprint=fs.readFileSync(path.join(root,'render.yaml'),'utf8');
  assert.ok(blueprint.includes('name: '+settings.review.serviceName));
  assert.ok(blueprint.includes('name: '+settings.llm.serviceName));
  assert.ok(blueprint.includes('branch: '+settings.deploymentBranch));
  assert.ok(blueprint.includes(settings.review.buildCommand));
  assert.ok(blueprint.includes('staticPublishPath: '+settings.review.publishPath));
});
