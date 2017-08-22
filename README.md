# gulp solutions for zrb

```javascript

    var gulp = require('gulp');
    var gulpZrb = require("gulp-zrb");
    
    gulpZrb({
        gulp: gulp, //必须传入gulp对象
        needOptimize: false, //默认js、CSS、image文件不需要压缩，线上需要开启压缩
        needCdn: false, //是否需要CDN
        fileExtMap: { //文件后缀名配置
            image: ['jpg', 'png', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
            style: ['css', 'less'],
            template: ['html'],
            script: ['js']
        },
        source: "client",
        output: "public",
        tplOutput: "views",
        cdn: "", //同时也支持数组
        serverStaticPath: "public" //server端渲染静态文件的第一个路径
    });
    
```