const fs = require("fs")
    , path = require("path")
    , parser = require("@babel/parser")
    , traverse = require("@babel/traverse")
    , babel = require("babel-core")
    , ejs = require("ejs");

// 声明模块id,用于映射模块path,相同的path下有可能会造成path冲突
let id = 0;
/**
 * 1.根据入口path获取webpack入口文件内容,根据内容解析模块依赖关系。
 * 解析模块依赖是解析通过import导入的模块文件,解析的方法分为正则表达式匹配 和 @babel-parser,
 * 通过@babel-parser的parse()可以将源码解析为ast(抽象语法树),由于需要在ast中获取import的模块,
 * 通常做法是遍历ast,而@babel/traverse是一个对ast进行遍历的工具,通过@babel/traverse遍历ast得到import的模块。
 * @param {*} filePath 
 * @returns 模块文件path、文件源码字符串、模块依赖
 */
function createAsset(filePath) {
    // 1.1 读取文件获取文件源码字符串
    const source = fs.readFileSync(filePath, { encoding: "utf-8" })
    // 1.2 将文件源码字符串转为ast。设置sourceType支持解析ESM语法,否则将报错
    const ast = parser.parse(source, { sourceType: "module" });

    let deps = [] // 模块依赖容器,用于存储模块依赖
    // 1.3 遍历ast根据ImportDeclaration节点类型获取依赖模块路径,并将依赖模块添加至模块依赖容器
    traverse.default(ast, {
        // 针对AST中ImportDeclaration节点类型操作
        ImportDeclaration({ node }) {
            // 添加模块依赖
            deps.push(node.source.value);
        },
    })
    /**
     * 1.4 将ESM模块形式的源码转为CommonJS模块形式的源码。
     * babel-core的transformFromAst()可以将ast转为字符串,
     * 利用babel-preset-env预设将ESM模块转为CommonJS模块,优点是兼容性好
     */
    const { code } = babel.transformFromAst(ast, null, {
        presets: ["env"] // 配置预设
    })

    // 将文件源码和模块依赖返回
    return {
        filePath,
        code,
        deps,
        id: id++,
        mapping: {} // 模块依赖的映射
    }
}

/**
 * 2.根据入口模块信息依赖构建一张模块依赖关系图
 * @returns 模块关系图
 */
function createGraph(entry) {
    const mainAsset = createAsset(entry);
    // 使用队列方式存储模块信息
    const queue = [mainAsset]
    for (let i = 0, len = queue.length; i < len; i++) {
        /**
         * 处理模块的依赖,因为模块的依赖也有可能依赖于其他模块,即a.js引入b.js,b.js又引入的c.js
         * 所以还需要通过createAsset()获取模块信息,并追加到模块队列中
         */
        queue[i].deps.forEach(relativePath => {
            if (relativePath) {
                // 解析模块依赖
                const childAsset = createAsset(path.resolve('./example', relativePath));
                queue[i].mapping[relativePath] = childAsset.id;
                // 追加到模块队列
                queue.push(childAsset);
            }
        })
    }
    return queue
}

/**
 * 3.将模块依赖关系的模块合并生成一个bundle.js。为了处理ESM需要把ESM形式转为Commonjs模块形式,
 * 借助ejs模板根据模块关系图生成bundle。
 * @param {*} options 打包配置信息
 */
function build(options) {
    const { entry, output } = options;
    const templateFilePath = './bundle.ejs'
    if (!entry) {
        throw new Error("entry Cannot be empty")
    }
    // 3.1 读取模板文件
    const template = fs.readFileSync(templateFilePath, {
        encoding: "utf-8"
    })
    // 根据模块关系图拼装模板所需数据
    const data = createGraph(entry).map(asset => {
        const { filePath, code, mapping, id } = asset;
        return { filePath, code, mapping, id }
    });

    // 3.2 渲染模板文件得到模板字符串源码
    const code = ejs.render(template, { data });

    // 3.3 生成构建文件,将源码写入到构建后的文件
    fs.writeFileSync(`${output.path}/${output.filename}`, code)
}

/**
 * 读取配置文件
 */
function readConfigFile() {
    const configFilePaths = ["webpack.config.js", "webpackfile.js"];
    const files = fs.readdirSync(__dirname);
    for (let i = 0, len = files.length; i < len; i++) {
        const index = configFilePaths.indexOf(files[i])
        if (index > -1) {
            const options = require(path.join(__dirname, configFilePaths[index]))
            if (options) {
                return options
            }
        }
    }
}

/**
 * 初始化
 */
function init() {
    const defaultOptions = {
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'bundle.js',
        }
    }
    // 当找不到配置文件时使用默认options
    const options = Object.assign(defaultOptions, readConfigFile() || {});
    build(options);
}
init();
