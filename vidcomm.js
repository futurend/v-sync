var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url');
var vidProc,
    vidProcLog = '',
    playing = false;
var localAddress,
    remoteAddress,
    port = 3000,
    req,
    res,
    comm = {
        'playing?': playing,
        'ended': playVideo
    };

// INIT ////////////////////////////////////

var exitFunction = function (code) {
    console.log('exiting');
    if (code) console.log('exited with code '+code);
    console.log(vidProcLog);
    // show cursor
    console.log('\033[?12l\033[?25h');
}

var respond = function (data) {
    // var head = {
    //     'Content-Length': Buffer.byteLength(data),
    //     'Content-Type': contentType || 'text/plain; charset=utf-8',
    //     'Expires': (new Date(cacheExpiry)).toUTCString(),
    //     'Access-Control-Allow-Origin': '*'
    // }

    // console.log('---');
    res.writeHead(200, headers);
    res.end(data);
}

var parseRequest = function () {
    var url = urlmod.parse(req.url);
    if (url.href) {
        console.log('valid url');
        if (comm[url.href]) comm[url.href]();
        else respond('0')
    } else {
        console.log('invalid url');
        respond('{error:"invalid url"}');
    }
}

var startServer = function () {
    console.log('starting local server.');
    // run local server
    http.createServer(function (req_, res_) {
        req = req_;
        res = res_;
        if (req.method === 'GET') {
            req.on('close', function() {
                console.log('error: connection closed');
            });
            req.on('data', function() {
                console.log('warn: data comming');
            });
            req.on('end', function() {
                console.log('req.on end');
                parseRequest();
            });
        } else {
            console.log('error: no accepted HTTP method');
            respond('0');
        }
    }).listen(port, localAddress);

    console.log('server running at http://'+localAddress+':'+port);
}

var playing = function () {
    if (vidProc) respond('1');
    else respond('0');
}

var playVideo = function (filename) {
    // check if the other video is playing
    // play video
    vidProc = spawn('omxplayer', [filename]);
    vidProc.stdout.on('data', function (data) { vidProcLog += data; });
    vidProc.stderr.on('data', function (data) { vidProcLog += data; });
}

var run = function () {
    var arg2 = process.argv[2];
    var arg3 = process.argv[3];
    // check for file to play back
    if (arg2) {
        console.log('arg2 exists.');
        if (arg2.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
            console.log('arg2 is valid.');
            // clear terminal, move cursor to top left and hide cursor
            console.log('\033[2J\033\033[H\033[?25l');
            // if another server address is provided...
            if (arg3) {
                if (arg3.search(/192\.168\.1\.\d+/) !== -1) {
                    remoteAddress = arg3;
                    // find local ip address
                    require('child_process').exec('ifconfig eth0 | grep \'inet addr:\' | cut -d: -f2 | awk \'{ print $1}\'', function (error, stdout, stderr) {
                        if (stdout.search(/192\.168\.1\.\d+/) !== -1) {
                            localAddress = stdout;
                            startServer();
                            playVideo(arg2);
                        } else {
                            console.log('couldn\'t find local ip address. letting server down.');
                            playVideo(arg2);
                        }
                    });
                } else {
                    console.log('couldn\'t get remote ip address. letting server down.');
                    playVideo(arg2);
                }
            } else {
                playVideo(arg2);
            }
        }
    } else {
        console.log('not enough arguments. a video filename must be provided.\ne.g.: node vidcomm.js filename.ext');
    }
}

// handle ctrl-C gracefully
process.on('SIGINT', function () {
    exitFunction();
    process.exit(1);
});

// START ///////////////////////////////////

// check if other vidcomm process is running
require('child_process').exec('ps aux | grep omxplayer | grep -v grep', function (error, stdout, stderr) {
    if (stdout.length) {
        console.log('vidcomm is already running on this machine. exiting.');
        console.log(stdout);
        exitFunction();
        process.exit(1);
    } else {
        console.log('vidcomm starting.');
        run();
    }
});
