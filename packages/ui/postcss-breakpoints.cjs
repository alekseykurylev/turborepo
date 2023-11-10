const fs = require("fs");
const path = require("path");
const postcss = require("postcss");

const breakpointsFile = path.resolve("./src/styles/breakpoints.css");
const breakpointsCss = fs.readFileSync(breakpointsFile, "utf-8");
const breakpoints = postcss
  .parse(breakpointsCss)
  .nodes.map((node) => {
    if (node.type === "atrule" && node.name === "custom-media") {
      const [_match, name, params] = node.params.match(/--(\w+)\s+(.+)/);
      return { name, params };
    }

    return null;
  })
  .filter(Boolean);

const cache = new WeakMap();

module.exports = () => ({
  postcssPlugin: "postcss-breakpoints",
  Comment(comment) {
    comment.remove();
  },
  Rule(rule) {
    if (rule.parent.name === "breakpoints") {
      const breakpointsRule = rule.parent;

      if (!cache.has(breakpointsRule)) {
        const medias = {
          all: new postcss.AtRule({ name: "media", params: "all" }),
          ...breakpoints.reduce((breakpointsMedias, breakpoint) => {
            breakpointsMedias[breakpoint.name] = new postcss.AtRule({
              name: "media",
              params: breakpoint.params,
            });
            return breakpointsMedias;
          }, {}),
        };
        cache.set(breakpointsRule, medias);

        Object.values(medias).forEach((media) => {
          breakpointsRule.parent.insertBefore(breakpointsRule, media);
        });
      }

      const clone = rule.clone();
      cache.get(breakpointsRule).all.append(clone);

      breakpoints.forEach((breakpoint) => {
        const clone = rule.clone();
        addPrefix(clone, breakpoint.name);
        cache.get(breakpointsRule)[breakpoint.name].append(clone);
      });

      rule.remove();

      if (breakpointsRule.nodes.length === 0) {
        breakpointsRule.remove();
        cache.delete(breakpointsRule);
      }
    }
  },
});

module.exports.postcss = true;

function addPrefix(node, prefix) {
  if (node.type === "atrule") {
    node.each((child) => addPrefix(child, prefix));
  }

  const classNameRegexp = /\.(-?ap-r-[a-z0-9\-]+)/g;

  if (/\.ap-(?:[A-Z][a-z]+)+(?:\.[a-z0-9\-]+){2,}/.test(node.selector)) {
    throw Error(`
      "${node.selector}" looks like it uses compound props on a component.
      "@breakpoints" does not support compound props yet.
    `);
  }

  if (classNameRegexp.test(node.selector)) {
    node.selector = node.selector.replace(classNameRegexp, `.${prefix}\\:$1`);
  }
}
