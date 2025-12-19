/**
 * NetSpy Build Script
 * 
 * 功能：
 * - 混淆 JavaScript 文件
 * - 压缩 CSS 文件
 * - 复制静态资源
 * - 打包成 ZIP 文件
 * 
 * 使用方法：
 * 1. npm install
 * 2. npm run build:prod
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const archiver = require('archiver');

// 配置
const CONFIG = {
    srcDir: __dirname,
    distDir: path.join(__dirname, 'dist'),
    outputZip: path.join(__dirname, 'NetSpy-v1.3.0.zip'),

    // 需要混淆的 JS 文件
    jsFiles: [
        'background.js',
        'devtools.js',
        'popup.js',
        'js/main.js',
        'js/utils.js',
        'js/utils/encoding.js',
        'js/utils/validators.js',
        'js/core/store.js',
        'js/ui/detailPanel.js',
        'js/ui/requestList.js',
        'js/ui/toolbar.js',
        'js/ui/responseViewer.js',
    ],

    // 需要压缩的 CSS 文件
    cssFiles: [
        // Modular CSS files - order matters (variables first)
        'styles/variables.css',
        'styles/base.css',
        'styles/toolbar.css',
        'styles/layout.css',
        'styles/request-table.css',
        'styles/detail-panel.css',
        'styles/kv-editor.css',
        'styles/body-editor.css',
        'styles/intercept.css',
        'styles/buttons.css',
        'styles/json-viewer.css',
        'styles/media-preview.css',
        'popup.css',
    ],

    // 需要直接复制的文件
    copyFiles: [
        'manifest.json',
        'panel.html',
        'devtools.html',
        'popup.html',
        'help.html',
    ],

    // 需要复制的目录
    copyDirs: [
        'icons',
    ],

    // Terser 混淆配置
    terserOptions: {
        compress: {
            drop_console: false,  // 保留 console（调试用）
            drop_debugger: true,
            dead_code: true,
            unused: true,
        },
        mangle: {
            toplevel: false,  // 不混淆顶层变量（ES modules 需要）
            properties: false, // 不混淆属性名
        },
        format: {
            comments: false,  // 移除注释
        },
        module: true,  // ES modules 支持
    },
};

// 是否启用混淆
const isMinify = process.argv.includes('--minify');

async function build() {
    console.log('🚀 NetSpy Build Script');
    console.log('='.repeat(50));
    console.log(`Mode: ${isMinify ? '🔒 Production (Minified)' : '📝 Development'}`);
    console.log('');

    // 清理 dist 目录
    if (fs.existsSync(CONFIG.distDir)) {
        fs.rmSync(CONFIG.distDir, { recursive: true });
    }
    fs.mkdirSync(CONFIG.distDir, { recursive: true });
    fs.mkdirSync(path.join(CONFIG.distDir, 'js'), { recursive: true });
    fs.mkdirSync(path.join(CONFIG.distDir, 'js/utils'), { recursive: true });
    fs.mkdirSync(path.join(CONFIG.distDir, 'js/core'), { recursive: true });
    fs.mkdirSync(path.join(CONFIG.distDir, 'js/ui'), { recursive: true });

    // 处理 JS 文件
    console.log('📦 Processing JavaScript files...');
    for (const file of CONFIG.jsFiles) {
        await processJS(file);
    }

    // Process CSS files
    console.log('\n🎨 Processing CSS files...');
    // Concatenate modular styles into single style.css for dist
    const styleFiles = CONFIG.cssFiles.filter(f => f.startsWith('styles/'));
    const otherCssFiles = CONFIG.cssFiles.filter(f => !f.startsWith('styles/'));

    if (styleFiles.length > 0) {
        let combinedCss = '';
        for (const file of styleFiles) {
            const srcPath = path.join(CONFIG.srcDir, file);
            if (fs.existsSync(srcPath)) {
                combinedCss += fs.readFileSync(srcPath, 'utf8') + '\n';
                console.log(`   ✓ ${file} (merged)`);
            }
        }

        const distPath = path.join(CONFIG.distDir, 'style.css');
        if (isMinify) {
            const result = new CleanCSS({ level: 2 }).minify(combinedCss);
            fs.writeFileSync(distPath, result.styles);
            const ratio = ((1 - result.styles.length / combinedCss.length) * 100).toFixed(1);
            console.log(`   → style.css (merged, ${ratio}% smaller)`);
        } else {
            fs.writeFileSync(distPath, combinedCss);
            console.log(`   → style.css (merged)`);
        }
    }

    for (const file of otherCssFiles) {
        processCSS(file);
    }

    // 复制静态文件
    console.log('\n📋 Copying static files...');
    for (const file of CONFIG.copyFiles) {
        copyFile(file);
    }

    // Replace modular CSS links with single style.css in dist panel.html
    const distPanelPath = path.join(CONFIG.distDir, 'panel.html');
    if (fs.existsSync(distPanelPath)) {
        let panelHtml = fs.readFileSync(distPanelPath, 'utf8');
        // Replace all modular CSS links with single style.css
        panelHtml = panelHtml.replace(
            /(\s*<link rel="stylesheet" href="styles\/[^"]+">[\r\n]*)+/g,
            '    <link rel="stylesheet" href="style.css">\n'
        );
        fs.writeFileSync(distPanelPath, panelHtml);
        console.log('   ✓ panel.html (CSS links replaced for dist)');
    }

    // 复制目录
    console.log('\n📁 Copying directories...');
    for (const dir of CONFIG.copyDirs) {
        copyDir(dir);
    }

    // 打包成 ZIP
    console.log('\n📦 Creating ZIP archive...');
    await createZip();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Build completed successfully!');
    console.log(`📁 Output: ${CONFIG.distDir}`);
    console.log(`📦 ZIP: ${CONFIG.outputZip}`);
}

async function processJS(file) {
    const srcPath = path.join(CONFIG.srcDir, file);
    const distPath = path.join(CONFIG.distDir, file);

    if (!fs.existsSync(srcPath)) {
        console.log(`   ⚠️ Skip (not found): ${file}`);
        return;
    }

    const code = fs.readFileSync(srcPath, 'utf8');

    if (isMinify) {
        try {
            const result = await minify(code, CONFIG.terserOptions);
            fs.writeFileSync(distPath, result.code);
            const ratio = ((1 - result.code.length / code.length) * 100).toFixed(1);
            console.log(`   ✓ ${file} (${ratio}% smaller)`);
        } catch (e) {
            console.log(`   ⚠️ ${file} - minify failed, copying original`);
            console.log(`      Error: ${e.message}`);
            fs.writeFileSync(distPath, code);
        }
    } else {
        fs.writeFileSync(distPath, code);
        console.log(`   ✓ ${file}`);
    }
}

function processCSS(file) {
    const srcPath = path.join(CONFIG.srcDir, file);
    const distPath = path.join(CONFIG.distDir, file);

    if (!fs.existsSync(srcPath)) {
        console.log(`   ⚠️ Skip (not found): ${file}`);
        return;
    }

    const code = fs.readFileSync(srcPath, 'utf8');

    if (isMinify) {
        const result = new CleanCSS({ level: 2 }).minify(code);
        fs.writeFileSync(distPath, result.styles);
        const ratio = ((1 - result.styles.length / code.length) * 100).toFixed(1);
        console.log(`   ✓ ${file} (${ratio}% smaller)`);
    } else {
        fs.writeFileSync(distPath, code);
        console.log(`   ✓ ${file}`);
    }
}

function copyFile(file) {
    const srcPath = path.join(CONFIG.srcDir, file);
    const distPath = path.join(CONFIG.distDir, file);

    if (!fs.existsSync(srcPath)) {
        console.log(`   ⚠️ Skip (not found): ${file}`);
        return;
    }

    fs.copyFileSync(srcPath, distPath);
    console.log(`   ✓ ${file}`);
}

function copyDir(dir) {
    const srcPath = path.join(CONFIG.srcDir, dir);
    const distPath = path.join(CONFIG.distDir, dir);

    if (!fs.existsSync(srcPath)) {
        console.log(`   ⚠️ Skip (not found): ${dir}`);
        return;
    }

    fs.mkdirSync(distPath, { recursive: true });

    const files = fs.readdirSync(srcPath);
    for (const file of files) {
        const srcFile = path.join(srcPath, file);
        const distFile = path.join(distPath, file);

        if (fs.statSync(srcFile).isDirectory()) {
            copyDir(path.join(dir, file));
        } else {
            fs.copyFileSync(srcFile, distFile);
        }
    }
    console.log(`   ✓ ${dir}/`);
}

function createZip() {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(CONFIG.outputZip);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            const size = (archive.pointer() / 1024).toFixed(1);
            console.log(`   ✓ ${path.basename(CONFIG.outputZip)} (${size} KB)`);
            resolve();
        });

        archive.on('error', reject);
        archive.pipe(output);
        archive.directory(CONFIG.distDir, false);
        archive.finalize();
    });
}

// 运行构建
build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
