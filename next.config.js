/** @type {import('next').NextConfig} */
const { i18n } = require('./next-i18next.config')
const path = require('path')

const nextConfig = {
    // assetPrefix: ".", // https://github.com/vercel/next.js/issues/8158#issuecomment-687707467
    output: 'standalone', // https://developers.redhat.com/articles/2022/11/23/how-deploy-nextjs-applications-red-hat-openshift#building_a_container_to_run_your_next_js_application
    reactStrictMode: true,
    productionBrowserSourceMaps: true,
    reactStrictMode: true,
    poweredByHeader: false,
    // sassOptions: {
    //     includePaths: [path.join(__dirname, 'styles')],
    // },
    // images: {
    //     domains: ["www.polyu.edu.hk", "polyu.edu.hk"],
    //     formats: ["image/webp"],
    // },
}

module.exports = nextConfig


// module.exports = {
    
// }