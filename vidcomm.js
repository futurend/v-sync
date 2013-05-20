var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url'),
    vidProc,
    vidProcLog = '',
    localAddress = '192.168.1.94',
    localPort = 3000,
    remoteAddress = '192.168.1.95',
    remotePort = 3000;

// INIT ////////////////////////////////////

var exitFunction = function (code) {
    console.log('exiting');
    if (code) console.log('exited with code '+code);
    console.log(vidProcLog);
    // show cursor
    console.log('\033[?12l\033[?25h');
}

var respond = function (data, req, res, headers, callback) {
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

var parseRequest = function (req_, res_) {
    var url = urlmod.parse(req_.url);
    
    if (url.href) {
        console.log('valid url');
        respond(url.href, req_, res_);
    } else {
        console.log('invalid url');
        respond('{error:"invalid url"}', req_, res_);
    }
}

var startServer = function () {
    // run local server
    http.createServer(function (req, res) {
        if (req.method === 'GET') {
            req.on('close', function() {
                console.log('error: connection closed');
            });
            req.on('data', function() {
                console.log('warn: data comming');
            });
            req.on('end', function() {
                console.log('req.on end');
                parseRequest(req, res);
            });
        } else {
            console.log('error: no accepted HTTP method');
            respond('', req, res);
        }
    }).listen(localPort, localAddress);

    console.log('Server running at http://'+localAddress+':'+localPort);
}

var run = function () {
    var arg = process.argv[2];
    // check for file to play back
    if (arg) {
        if (arg.search(/^[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
            console.log('arg is valid.');
            // clear terminal, move cursor to top left and hide cursor
            console.log('\033[2J\033\033[H\033[?25l');
            // start web server
            startServer();
            // check if the other video is playing
            // play video
            vidProc = spawn('omxplayer', [arg]);
            vidProc.stdout.on('data', function (data) { vidProcLog += data; });
            vidProc.stderr.on('data', function (data) { vidProcLog += data; });
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
