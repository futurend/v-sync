var spawn = require('child_process').spawn,
    http = require('http'),
    urlmod = require('url');
var vidProc,
    player,
    vidProcLog = '',
    playing = false;
var localAddress,
    remoteAddress,
    port = 3000,
    req,
    res;

// INIT ////////////////////////////////////

var exitFunction = function (code) {
    console.log('exiting vidcomm');
    if (code) console.log('exited with code '+code);
    if (vidProcLog.length) console.log(vidProcLog);
    // show cursor
    console.log('\033[?12l\033[?25h');
}

var respond = function (data) {
    var headers = {
        'Content-Length': Buffer.byteLength(data),
        'Content-Type': 'text/plain; charset=utf-8',
        'Expires': (new Date(Date.now)).toUTCString()
    }
    res.writeHead(200, headers);
    res.end(data);
}

var parseRequest = function () {
    var url = urlmod.parse(req.url);
    if (url.href) {
        var cmd = url.href.slice(1);
        console.log(cmd);
        if (cmd === 'playing') playing();
        else if (cmd === 'ended') playVideo();
        else respond('bad command');
    } else {
        console.log('invalid url');
        respond('error: invalid url');
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
    vidProc = player === 'omxplayer' ? spawn('omxplayer', [filename]) : spawn('mplayer', ['-vm', filename]);
    vidProc.stdout.on('data', function (data) { vidProcLog += data; });
    vidProc.stderr.on('data', function (data) { vidProcLog += data; });
}

var run = function () {
    var arg2 = process.argv[2];
    var arg3 = process.argv[3];
    // check for file to play back
    if (arg2) {
        console.log('arg2 exists: '+arg2);
        if (arg2.search(/^\.*[^\.]+\.(mp4|m4v|mov)$/) !== -1) {
            // clear terminal, move cursor to top left and hide it
            console.log('\033[2J\033\033[H\033[?25l');
            // if another server address is provided...
            if (arg3) {
                console.log('arg3 exists: '+arg3);
                // validate the address
                if (arg3.search(/192\.168\.1\.\d+/) !== -1) {
                    remoteAddress = arg3;
                    // find local ip address
                    require('child_process').exec('ifconfig eth0 | grep \'inet addr:\' | cut -d: -f2 | awk \'{ print $1}\'', function (error, stdout, stderr) {
                        // validate the address
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
                    console.log('couldn\'t understand remote ip address. letting server down.');
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

// check whether other vidcomm process is running on the system
var checkForDuplicates = function () {
    require('child_process').exec('ps aux | grep '+player+' | grep -v grep', function (error, stdout, stderr) {
        if (stdout.length) {
            console.log('a video player is already running on this machine.');
            console.log(stdout);
            exitFunction();
            process.exit(1);
        } else {
            console.log('vidcomm starting.');
            run();
        }
    });
}

// handle ctrl-C gracefully
process.on('SIGINT', function () {
    console.log(' ');
    exitFunction();
    process.exit(1);
});

// START ///////////////////////////////////

// check which player is available on the system
require('child_process').exec('which omxplayer', function (error, stdout, stderr) {
    if (stdout[0] !== '/') {
        require('child_process').exec('which mplayer', function (error, stdout, stderr) {
            if (stdout[0] !== '/') {
                console.log('no video player available.');
                exitFunction();
                process.exit(1);
            } else {
                player = 'mplayer';
                checkForDuplicates();
            }
        });
    } else {
        player = 'omxplayer';
        checkForDuplicates();
    }
});