'use strict';

const pm2 = require('pm2');
const pmx = require('pmx');
const http = require('http');


let moduleConfig = {}; //模块配置

//应用入口
pmx.initModule({

  // Keymetrics相关样式配置
  widget: {

    // Logo displayed
    logo: 'https://app.keymetrics.io/img/logo/keymetrics-300.png',

    // Module colors
    // 0 = main element
    // 1 = secondary
    // 2 = main border
    // 3 = secondary border
    theme: ['#141A1F', '#222222', '#3ff', '#3ff'],

    // Section to show / hide
    el: {
      probes: true,
      actions: false
    },

    // Main block to show / hide
    block: {
      actions: false,
      issues: true,
      meta: true,

      // Custom metrics to put in BIG
      main_probes: ['webhook']
    }

  }

}, (a, opts) => {

  //moniter监听端口
  if (isNaN(opts.port) || opts.port <= 0) {
    opts.port = 5000;
  }

  moduleConfig = opts;

  //monit监控注册数
  let probe = pmx.probe();
  probe.metric({
    name: `moniter端口`,
    value: function () {
      return opts.port;
    }
  });

  //定时任务 检查进程
  pm2.connect((err) => {
    if (err) {
      console.error('error', err)
      process.exit(-1);
    }

    console.log(opts.module_name, 'connected');

    //启动服务
    startServer(opts);
  });

  //模块重启
  pm2.reloadLogs(function (err, result) {
    console.log('模块reload', err, result);
  })

});

/**
 * 启动WEB服务
 *
 * @param {*} config 
 */
function startServer(config) {
  const webApp = require('./web')(config);
  // webApp.use(async (ctx, next) => {
  //   ctx._config = config;
  //   await next();
  // });

  let server = http.createServer({}, webApp.callback());
  server.listen(config.port);
  server.on('error', onError);
  server.on('listening', () => {
    console.log(`健康检查地址：http://localhost:${server.address().port}/moniter/view`);
    console.log(`修改健康检查端口：pm2 set ${config.module_name}:port 5000`);
  });
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  let bind = typeof port === 'string' ?
    'Pipe ' + port :
    'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}