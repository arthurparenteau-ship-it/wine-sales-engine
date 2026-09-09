import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
class Node {
  children = []; attributes = {}; textContent = ''; classList = {add(){}, remove(){}};
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this[event] = callback; }
  get innerHTML() { throw Error('Unsafe HTML rendering'); }
  set innerHTML(value) { throw Error('Unsafe HTML rendering'); }
}
function setup(fetch) {
  const nodes = new Map();
  const context = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, alert(){}, document:{
    createElement: () => new Node(), createDocumentFragment: () => new Node(),
    getElementById: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }
  }});
  vm.runInContext(source, context);
  return {nodes, context};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('loading, empty, populated, literal HTML, error and retry', async () => {
  let resolve;
  const {nodes, context} = setup(() => new Promise(r => resolve = r));
  assert.equal(nodes.get('prospects').attributes['aria-busy'], 'true');
  resolve(Response.json({success:true, companies:[]}));
  await tick();
  assert.match(nodes.get('prospects').children[0].textContent, /No companies/);
  assert.equal(nodes.get('trackedCount').textContent, 0);
  context.fetch = async () => Response.json({success:true, companies:[{name:'<img src=x onerror=alert(1)>', opportunity_score:0, buying_intent:null}]});
  await vm.runInContext('loadCompanies()', context);
  const row = nodes.get('prospects').children[0].children[0];
  assert.equal(row.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(nodes.get('averageScore').textContent, 0);
  context.fetch = async () => { throw Error('network'); };
  await vm.runInContext('loadCompanies()', context);
  assert.equal(nodes.get('trackedCount').textContent, '—');
  const retry = nodes.get('prospects').children[0].children[1];
  assert.equal(retry.textContent, 'Retry');
  context.fetch = async () => Response.json({success:true, companies:[]});
  await retry.click();
  assert.match(nodes.get('prospects').children[0].textContent, /No companies/);
  assert.equal(nodes.get('prospects').attributes['aria-busy'], 'false');
});
