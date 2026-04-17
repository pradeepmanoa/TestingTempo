const { types: t } = require('@babel/core');
const Path = require('path');

const ATTR_NAME = 'data-source-id';
const SKIP_PROPS = new Set(['data-source-id', 'data-source-tag', 'data-source-props', 'key', 'ref', 'children', 'className', 'style']);

function isFragment(nameNode) {
  if (nameNode.type === 'JSXIdentifier' && nameNode.name === 'Fragment') return true;
  if (
    nameNode.type === 'JSXMemberExpression' &&
    nameNode.property.name === 'Fragment'
  )
    return true;
  return false;
}

function getTagName(nameNode) {
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXMemberExpression') {
    return getTagName(nameNode.object) + '.' + nameNode.property.name;
  }
  return null;
}

function extractStaticValue(attr) {
  // No value means implicit true: <Button disabled />
  if (!attr.value) return true;
  // String literal: variant="Primary"
  if (t.isStringLiteral(attr.value)) return attr.value.value;
  // Expression container: {5}, {false}, {null}
  if (t.isJSXExpressionContainer(attr.value)) {
    const expr = attr.value.expression;
    if (t.isNumericLiteral(expr)) return expr.value;
    if (t.isBooleanLiteral(expr)) return expr.value;
    if (t.isNullLiteral(expr)) return null;
    if (t.isStringLiteral(expr)) return expr.value;
  }
  return undefined; // non-static — skip
}

function isComponent(tagName) {
  return tagName && /^[A-Z]/.test(tagName);
}

const DESIGN_SYSTEM_PATH = 'design-system/';
const DESIGN_SYSTEM_ALIAS = '@/';

module.exports = function () {
  return {
    name: 'jsx-source-id',
    visitor: {
      Program(path, state) {
        // Track which identifiers are imported from design-system
        state.designSystemImports = new Set();
        path.traverse({
          ImportDeclaration(importPath) {
            const source = importPath.node.source.value;
            if (source.startsWith(DESIGN_SYSTEM_ALIAS) || source.includes(DESIGN_SYSTEM_PATH)) {
              for (const specifier of importPath.node.specifiers) {
                state.designSystemImports.add(specifier.local.name);
              }
            }
          }
        });
      },
      JSXElement(path, state) {
        const filePath = Path.relative(state.cwd || '', state.filename || '');
        if (filePath.startsWith(DESIGN_SYSTEM_PATH)) return;
        const openingElement = path.node.openingElement;
        if (isFragment(openingElement.name)) return;

        const { attributes } = openingElement;
        if (attributes.some((a) => a.name?.name === ATTR_NAME)) return;

        const loc = openingElement.loc;
        if (!loc) return;

        const value = `${filePath}:${loc.start.line}:${loc.start.column}`;
        const tagName = getTagName(openingElement.name);

        // Collect props
        const props = {};
        for (const attr of attributes) {
          if (t.isJSXSpreadAttribute(attr)) continue;
          const name = attr.name?.name;
          if (!name || SKIP_PROPS.has(name)) continue;
          const val = extractStaticValue(attr);
          if (val !== undefined) props[name] = val;
        }

        // For design-system components, wrap with a marker span
        const isDesignSystemComponent = isComponent(tagName) && state.designSystemImports?.has(tagName);
        if (isDesignSystemComponent) {
          const markerAttrs = [
            t.jsxAttribute(t.jsxIdentifier('data-component'), t.stringLiteral(tagName)),
            t.jsxAttribute(t.jsxIdentifier('data-source-id'), t.stringLiteral(value)),
            t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(
              t.objectExpression([t.objectProperty(t.identifier('display'), t.stringLiteral('contents'))])
            )),
          ];
          if (Object.keys(props).length > 0) {
            markerAttrs.push(
              t.jsxAttribute(t.jsxIdentifier('data-source-props'), t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(props))))
            );
          }

          const wrapper = t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier('span'), markerAttrs),
            t.jsxClosingElement(t.jsxIdentifier('span')),
            [path.node]
          );
          path.replaceWith(wrapper);
          path.skip();
          return;
        }

        // For native elements, add attributes directly
        attributes.push(t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), t.stringLiteral(value)));
        if (tagName) {
          attributes.push(t.jsxAttribute(t.jsxIdentifier('data-source-tag'), t.stringLiteral(tagName)));
        }
        if (Object.keys(props).length > 0) {
          attributes.push(
            t.jsxAttribute(t.jsxIdentifier('data-source-props'), t.jsxExpressionContainer(t.stringLiteral(JSON.stringify(props))))
          );
        }
      },
    },
  };
};
