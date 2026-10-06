// Serializable, immutable median-of-three quicksort, pruned to the requested top K.
const copy = value => structuredClone(value);
function shuffle(ids, random) {
  const shuffled = [...ids];
  for (let i=shuffled.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  return shuffled;
}
function node(ids, offset, limit, random) {
  if (offset>=limit) return {ids,offset,status:'excluded'};
  if (ids.length<=1) return {ids,offset,status:'sorted',order:[...ids]};
  if (ids.length<=4) return {ids,offset,status:'manual'};
  return {ids,offset,status:'sample',sample:shuffle(ids,random).slice(0,3)};
}
export function createSession(ids, limit, random=Math.random) {
  if (!Array.isArray(ids)||ids.length<1||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string')) throw new Error('対象曲が不正です。');
  if (!Number.isInteger(limit)||limit<1||limit>ids.length) throw new Error('ランキング曲数が不正です。');
  return {version:1,limit,total:ids.length,decisions:0,root:node([...ids],0,limit,random)};
}
export function activeNode(state) {
  function find(current) {
    if (['sample','compare','manual'].includes(current.status)) return current;
    if (current.status==='split') return find(current.highNode)||find(current.lowNode);
    return null;
  }
  return find(state.root);
}
function validateOrder(order, ids) {
  if (!Array.isArray(order)||order.length!==ids.length||new Set(order).size!==order.length||order.some(id=>!ids.includes(id))) throw new Error('すべての曲を一度ずつ順位付けしてください。');
}
function split(current,state,random) {
  current.status='split';
  current.highNode=node([...current.high],current.offset,state.limit,random);
  current.lowNode=node([...current.low],current.offset+current.high.length+1,state.limit,random);
  // Keep the partition lists for the visible history; children own further work.
}
export function rankSample(state, order, random=Math.random) {
  const next=copy(state), current=activeNode(next);
  if (current?.status!=='sample') throw new Error('3曲の順位付けではありません。');
  validateOrder(order,current.sample);
  current.pivot=order[1];
  current.high=[order[0]];
  current.low=[order[2]];
  current.queue=shuffle(current.ids.filter(id=>!order.includes(id)),random);
  current.cursor=0;
  current.status='compare';
  next.decisions++;
  return next;
}
export function choose(state, preferOpponent, random=Math.random) {
  const next=copy(state), current=activeNode(next);
  if (current?.status!=='compare'||typeof preferOpponent!=='boolean') throw new Error('2曲の比較ではありません。');
  (preferOpponent?current.high:current.low).push(current.queue[current.cursor]);
  current.cursor++;
  next.decisions++;
  if (current.cursor===current.queue.length) split(current,next,random);
  return next;
}
export function rankSmall(state, order) {
  const next=copy(state), current=activeNode(next);
  if (current?.status!=='manual') throw new Error('ブロックの順位付けではありません。');
  validateOrder(order,current.ids);
  current.order=[...order];
  current.status='sorted';
  next.decisions++;
  return next;
}
export function rankedIds(state) {
  function collect(current) {
    if (current.status==='sorted') return current.order;
    if (current.status==='split') return [...collect(current.highNode),current.pivot,...collect(current.lowNode)];
    return [];
  }
  if (activeNode(state)) return [];
  return collect(state.root).slice(0,state.limit);
}
export function resolvedCount(state) {
  function count(current) {
    if (current.offset>=state.limit) return 0;
    if (current.status==='sorted') return Math.min(current.ids.length,state.limit-current.offset);
    if (current.status==='split') return count(current.highNode)+count(current.lowNode)+(current.offset+current.high.length<state.limit?1:0);
    return 0;
  }
  return count(state.root);
}
