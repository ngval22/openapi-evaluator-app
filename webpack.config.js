const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
// const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

module.exports = {
  entry: './src/client/components/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/public'),
    filename: 'bundle.js',
    publicPath: '/'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: 
            {
                loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-react',
                            '@babel/preset-typescript',
                            '@babel/preset-env'
                        ],
                    },
            },
      },
      {
        test: /\.css$/i,
        exclude: /node_modules/,
        use: [
            'style-loader', // Injects styles into DOM
            'css-loader',   // Translates CSS into CommonJS
            'postcss-loader', // Processes CSS with PostCSS (and Tailwind)
        ],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
    }),
    new CopyWebpackPlugin({
        patterns: [
            {
                from: 'public', 
                to: '',
                globOptions: {
                    ignore: ['**/index.html'],
                },
            },
        ],
    }),
    // new BundleAnalyzerPlugin(),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist/public'),
    },
    compress: true,
    port: 8080,
    historyApiFallback: true,
      proxy: [
          {
              context: ['/api'],
              target: 'http://localhost:3000',
              changeOrigin: true,
              secure: false,
          }
      ],
  },
};
