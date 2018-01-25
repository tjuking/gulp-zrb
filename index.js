//依赖
var _ = require("lodash");
var argv = require('yargs').argv;
var gulpIf = require('gulp-if');
var uglify = require('gulp-uglify-es').default;
var imagemin = require('gulp-imagemin');
var less = require("gulp-less");
var minifyCss = require('gulp-minify-css');
var rev = require('gulp-rev');
var revCollector = require('gulp-rev-collector');
var rimraf = require('gulp-rimraf');
var htmlmin = require('gulp-htmlmin');
var resolvePath = require('gulp-resolve-path');
var RequireJsRely = require("gulp-requirejs-rely");
var replace = require("gulp-replace");
var crypto = require('crypto');

function init(options) {
    //传入参数与默认值的合并
    options = _.extend({
        gulp: "", //必须传入gulp对象
        needOptimize: false, //默认js、CSS、image文件不需要压缩，线上需要开启压缩
        noTplOptimize: false, //是否强制不对模板压缩（freemarker的解析有问题）
        needCdn: false, //是否需要CDN
        fileExtMap: { //文件后缀名配置
            image: ['jpg', 'png', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
            style: ['css', 'less'],
            script: ['js'],
            template: ['html']
        },
        source: "client",
        output: "public",
        tplOutput: "views",
        cdn: "", //也可以接收数组
        serverStaticPath: "public" //server端渲染静态文件的第一个路径
    }, options);

    var gulp = options.gulp;
    var runSequence = require('run-sequence').use(gulp);

    //gulp执行可附带的参数
    var needOptimize = options.needOptimize || (argv['o'] || argv['optimize']);
    var noTplOptimize = options.noTplOptimize || !needOptimize;
    var needCdn = options.needCdn || (argv['D'] || argv['domain']);
    var fileExtMap = options.fileExtMap;
    var sourceBase = options.source;
    var outputBase = options.output;
    var tplOutputBase = options.tplOutput;
    var cdn = getCdnArray(options.cdn);

    //js文件的依赖编译
    var requireJsRely = new RequireJsRely();

    //manifest文件的source地址
    var manifestSource = outputBase + '/**/**-manifest.json';

    //服务器端静态文件访问第一级路径，默认是outputBase
    var serverStaticPath = options.serverStaticPath;

    //路径替换关系
    var dirReplacements = {};
    setDirReplacements();

    /* =========================================== script start ============================================ */

    //脚本依赖关系分析
    gulp.task('_script', function () {
        return gulp.src(getSrcArr(fileExtMap.script, true), {base: sourceBase})
            .pipe(requireJsRely.collect())
            .on('end', function () {
                requireJsRely.analysis();
                setRelyScriptTask(requireJsRely.array);     //会生成relyScript任务
            });
    });

    //脚本任务
    gulp.task('script', ['_script'], function (cb) {
        runSequence(
            ['relyScript'],
            cb
        );
    });

    //更新脚本时的任务
    gulp.task('updateScript', function (cb) {
        runSequence(
            ['script'],
            ['template'],
            cb
        );
    });

    /* =========================================== script end ============================================ */

    /* =========================================== image start ============================================ */

    //图片任务
    gulp.task('image', function () {
        return gulp.src(getSrcArr(fileExtMap.image), {base: sourceBase})
            .pipe(gulpIf(needOptimize, imagemin()))
            .pipe(rev())
            .pipe(gulp.dest(outputBase))
            .pipe(rev.manifest({
                path: "./image-manifest.json",
                merge: true
            }))
            .pipe(gulp.dest(outputBase));
    });

    //更新图片时的任务
    gulp.task('updateImage', function (cb) {
        runSequence(
            ['image'],
            ['script', 'style'],
            ['template'],
            cb
        );
    });

    /* =========================================== image end ============================================ */

    /* =========================================== resource start ============================================ */

    //其它资源任务（无依赖）
    gulp.task('resource', function () {
        var resourceSrc = getResourceSrcArr();
        return gulp.src(resourceSrc, {base: sourceBase})
            .pipe(rev())
            .pipe(gulp.dest(outputBase))
            .pipe(rev.manifest({
                path: "./resource-manifest.json",
                merge: true
            }))
            .pipe(gulp.dest(outputBase));
    });

    //更新图片时的任务
    gulp.task('updateResource', function (cb) {
        runSequence(
            ['resource'],
            ['script', 'style'],
            ['template'],
            cb
        );
    });

    /* =========================================== resource end ============================================ */

    /* =========================================== style start ============================================ */

    //样式表任务
    gulp.task('style', function () {
        return gulp.src(getSrcArr(fileExtMap.style), {base: sourceBase})
            .pipe(resolvePath())
            .pipe(revCollector({
                dirReplacements: dirReplacements
            }))
            .pipe(less())
            .pipe(gulpIf(needOptimize, minifyCss({
                processImport: false
            })))
            .pipe(rev())
            .pipe(gulp.dest(outputBase))
            .pipe(rev.manifest({
                path: "./style-manifest.json",
                merge: true
            }))
            .pipe(gulp.dest(outputBase));
    });

    //更新样式表时的任务
    gulp.task('updateStyle', function (cb) {
        runSequence(
            ['style'],
            ['script'],
            ['template'],
            cb
        );
    });

    /* =========================================== style end ============================================ */

    /* =========================================== template start ============================================ */
    //模板任务
    gulp.task('template', function () {
        var tplSrcArr = getSrcArr(fileExtMap.template);
        return gulp.src(tplSrcArr, {base: sourceBase})
            .pipe(resolvePath())
            .pipe(replace(new RegExp("(\\/" + sourceBase + "\\/\\S+\\.)less", "ig"), function ($0, $1) { //支持less的定位
                return $1 + "css";
            }))
            .pipe(revCollector({
                dirReplacements: dirReplacements
            }))
            .pipe(gulpIf(!noTplOptimize, htmlmin()))
            .pipe(gulp.dest(tplOutputBase));
    });

    /* =========================================== template end ============================================ */

    //删除文件任务
    gulp.task('clean', function () {
        return gulp.src([outputBase, tplOutputBase], {read: false})
            .pipe(rimraf({force: true}));
    });

    //监听文件
    gulp.task('watch', function () {
        gulp.watch(getSrcArr(fileExtMap.image, true), ['updateImage']);
        gulp.watch(getResourceSrcArr(), ['updateResource']);
        gulp.watch(getSrcArr(fileExtMap.style, true), ['updateStyle']);
        gulp.watch(getSrcArr(fileExtMap.script, true), ['updateScript']);
        gulp.watch(getSrcArr(fileExtMap.template, true), ['template']);
    });

    //默认任务（编译）
    gulp.task('default', function (cb) {
        runSequence(
            ['clean'],
            ['image', 'resource'],
            ['style'],
            ['script'],//脚本依赖样式表
            ['template'],
            cb
        );
    });

    //上线的编译（等价于gulp -o -D）
    gulp.task("online", function (cb) {
        needOptimize = true; //线上编译模式需要混淆压缩
        noTplOptimize = options.noTplOptimize;
        needCdn = true;
        setDirReplacements();
        runSequence(["default"], cb);
    });

    //设置替换目录的对应关系
    function setDirReplacements() {
        var staticMatchPath = new RegExp("^/" + outputBase);
        var staticReplacePath = "/" + serverStaticPath;
        if (needCdn && cdn.length > 0) {
            if (cdn.length > 1) {
                dirReplacements["/" + sourceBase] = function (manifestValue) {
                    var domain = cdn[md5(manifestValue).charCodeAt(0) % cdn.length];
                    return domain + staticReplacePath + "/" + manifestValue;
                };
                return false;
            } else {
                staticReplacePath = cdn[0] + staticReplacePath;
            }
        }
        dirReplacements["/" + sourceBase] = ("/" + outputBase).replace(staticMatchPath, staticReplacePath);
    }

    //设置依赖js的task
    function setRelyScriptTask(scriptsArray) {
        var scriptTasks = [];
        for (var i = 0; i < scriptsArray.length; i++) {
            var taskName = "relyScript" + i;
            var srcArr = [manifestSource];
            for (var j = 0; j < scriptsArray[i].length; j++) {
                srcArr.push(scriptsArray[i][j].substring(1));
            }
            scriptTasks.push(taskName);
            gulpScript(taskName, srcArr);
        }
        //实际的脚本任务
        gulp.task('relyScript', function (cb) {
            scriptTasks.push(cb);
            runSequence.apply(null, scriptTasks);
        });
    }

    //脚本的单个编译任务
    function gulpScript(taskName, srcArr) {
        srcArr = srcArr || [];
        srcArr.push(manifestSource); //默认塞入manifest
        gulp.task(taskName, function () {
            return gulp.src(srcArr, {base: sourceBase})
                .pipe(resolvePath())
                .pipe(replace(new RegExp("(\\/" + sourceBase + "\\/\\S+\\.)less", "ig"), function ($0, $1) { //支持less的定位
                    return $1 + "css";
                }))
                .pipe(revCollector({
                    dirReplacements: dirReplacements
                }))
                .pipe(gulpIf(needOptimize, uglify()))
                .pipe(rev())
                .pipe(gulp.dest(outputBase))
                .pipe(rev.manifest({
                    path: "./" + taskName + "-manifest.json",
                    merge: true
                }))
                .pipe(gulp.dest(outputBase));
        });
    }

    /**
     * 获取后缀文件的资源列表
     * suffixArr [array] 后缀名数组
     * [noManifest] [boolean] 是否需要manifest文件
     * [revert] [boolean] 是否取反
     **/
    function getSrcArr(suffixArr, noManifest, revert) {
        var i;
        var resultArr = [];
        if (!suffixArr || !suffixArr.length) {
            return "";
        }
        for (i = 0; i < suffixArr.length; i++) {
            resultArr[i] = (revert ? "!" : "") + sourceBase + '/**/**.' + suffixArr[i];
        }
        if (!noManifest) {
            resultArr.unshift(manifestSource);
        }
        return resultArr;
    }

    //获取资源文件的src列表
    function getResourceSrcArr() {
        var definedSuffixArr = [];
        var results;
        for (var key in fileExtMap) {
            if (fileExtMap.hasOwnProperty(key)) {
                definedSuffixArr = definedSuffixArr.concat(fileExtMap[key]);
            }
        }
        results = getSrcArr(definedSuffixArr, true, true);
        results.unshift(sourceBase + "/**/*.*"); //必须包含后缀名，否则目录也会被识别
        return results;
    }

    //获取整理后的cdn列表
    function getCdnArray(data) {
        var result = [];
        if (!(data instanceof Array)) {
            data = [data];
        }
        for (var i = 0; i < data.length; i++) {
            if (data[i]) {
                result.push(data[i]);
            }
        }
        return result;
    }

    //按位数生成md5串
    function md5(data, len) {
        var md5sum = crypto.createHash('md5');
        var encoding = typeof data === 'string' ? 'utf8' : 'binary';
        md5sum.update(data, encoding);
        len = len || 10;
        return md5sum.digest('hex').substring(0, len);
    }
}

module.exports = init;