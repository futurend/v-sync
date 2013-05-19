var spawn = require('child_process').spawn,
    http = require('http'),
    vidProc,
    vidProcLog = '';

// INIT ////////////////////////////////////

var exitFunction = function (code) {
    console.log('exited with code '+code);
    console.log(vidProcLog);
    // show cursor
    console.log('\033[?12l\033[?25h');
}

var run = function () {
    // clear terminal, move cursor to top left and hide cursor
    console.log('\033[2J\033\033[H\033[?25l');
    // play video
    vidProc = spawn('omxplayer', ['/home/pi/ferrandini.mp4']);
    vidProc.stdout.on('data', function (data) { vidProcLog += data; });
    vidProc.stderr.on('data', function (data) { vidProcLog += data; });
}

// handle ctrl-C gracefully
process.on('SIGINT', exitFunction);

// START ///////////////////////////////////

process.argv.forEach(function (val,idx,arr) {
    console.log(idx +': '+ val);
});

require('child_process').exec('ps aux | grep omxplayer | grep -v grep', function (error, stdout, stderr) {
    if (stdout.length) {
	console.log('vidcomm already running on this machine');
	console.log(stdout);
        exitFunction();
        process.exit(1);
    } else {
        // run();
    }
});
