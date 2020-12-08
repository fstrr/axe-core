import cache from '../base/cache';
import getNodeAttributes from './get-node-attributes';
import { convertSelector, matchesExpression } from './matches';

function cacheSelector(key, vNode) {
  let selectorMap = cache.get('selectorMap');

  if (!selectorMap) {
    selectorMap = {};
    cache.set('selectorMap', selectorMap);
  }

  selectorMap[key] = selectorMap[key] || [];
  selectorMap[key].push(vNode);
}

/**
 * Cache selector information about a VirtalNode
 * @param {VirtualNode} vNode
 */
export function cacheNodeSelectors(vNode) {
  if (vNode.props.nodeType !== 1) {
    return;
  }

  // node index is used for sorting nodes by their DOM order in
  // `axe.utils.querySelectorAllFtiler` since multiple expressions
  // need to sort the nodes by DOM order
  const nodeIndex = cache.get('nodeIndex') || 0;
  vNode._nodeIndex = nodeIndex;
  cache.set('nodeIndex', nodeIndex + 1);

  cacheSelector(vNode.props.nodeName, vNode);
  cacheSelector('*', vNode);

  // tests can pass non-node elements that don't have cloneNode
  let attributes;
  try {
    attributes = getNodeAttributes(vNode.actualNode);
  } catch (e) {
    attributes = [];
  }

  for (var i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    cacheSelector(`[${attr.name}]`, vNode);
  }
}

/**
 * Get nodes from the selector cache that match the selector
 * @param {VirtualTree[]} domTree flattened tree collection to search
 * @param {String} selector
 * @param {Function} filter function (optional)
 * @return {Mixed} Array of nodes that match the selector or undefined if the selector map is not setup
 */
export function getNodesMatchingSelector(domTree, selector, filter) {
  const selectorMap = domTree[0]._selectorMap;
  if (!selectorMap) {
    return;
  }

  const shadowId = domTree[0].shadowId;
  const expressions = convertSelector(selector);
  let matchedNodes = [];

  expressions.forEach(function(expression) {
    // use the last part of the expression to find nodes as it's more
    // specific. e.g. for `body *` use `*` and not `body`
    const exp = expression[expression.length - 1];

    // the expression `[id]` will use `*` as the tag name
    const isGlobalSelector =
      exp.tag === '*' && !exp.attributes && !exp.id && !exp.classes;
    let nodes = [];

    if (isGlobalSelector && selectorMap['*']) {
      nodes = selectorMap['*'];
    }
    // for `h1[role]` we want to use the tag name as it is more
    // specific than using all nodes with the role attribute
    else if (exp.tag && exp.tag !== '*' && selectorMap[exp.tag]) {
      nodes = selectorMap[exp.tag];
    } else if (exp.id && selectorMap['[id]']) {
      // when using id selector (#one) we should only select nodes
      // that match the shadowId of the root
      nodes = selectorMap['[id]'].filter(node => node.shadowId === shadowId);
    } else if (exp.classes && selectorMap['[class]']) {
      nodes = selectorMap['[class]'];
    } else if (exp.attributes) {
      for (var i = 0; i < exp.attributes.length; i++) {
        var attrName = exp.attributes[i].key;
        if (selectorMap['['.concat(attrName, ']')]) {
          nodes = selectorMap['['.concat(attrName, ']')];
          break;
        }
      }
    }

    nodes.forEach(node => {
      if (matchesExpression(node, expression) && !matchedNodes.includes(node)) {
        matchedNodes.push(node);
      }
    });
  });

  if (filter) {
    matchedNodes = matchedNodes.filter(filter);
  }

  return matchedNodes.sort((a, b) => a._nodeIndex - b._nodeIndex);
}