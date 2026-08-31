// npx svgo@3 --config scripts/svgo.config.js -f web/public/plans
module.exports = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false,
          // render_plans.py emits the sheet's coordinates on a coarse grid inside a
          // scale() group; never push that transform down into the paths or bake it
          // back into the path data (it would restore full-precision numbers).
          moveGroupAttrsToElems: false,
          collapseGroups: false,
          // curveSmoothShorthands crashes svgo 3.3 (reflectPoint on an unset control
          // point) on these sheets' glyph outlines under multipass.
          convertPathData: { applyTransforms: false, curveSmoothShorthands: false },
        },
      },
    },
  ],
};
