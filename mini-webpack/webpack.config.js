const path = require("path")
module.exports = {
    entry: "./example/main.js",
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundles.js',
    }
}