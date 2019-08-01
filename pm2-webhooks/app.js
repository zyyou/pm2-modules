'use strict';

const pm2 = require('pm2');
const pmx = require('pmx');
const os = require('os');
const http = require('https-sync');

let processList = {}; //进程配置列表
let messages = []; //消息缓冲区 at,pname,pid,data
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

  //进程监测频率
  if (isNaN(opts.interval_check) || opts.interval_check < 10) {
    opts.interval_check = 5000;
  }

  //推送频率
  if (isNaN(opts.interval_push) || opts.interval_push < 1000) {
    opts.interval_push = 5000;
  }

  //批处理消息数（从消息缓冲区shift数，非合并消息）
  if (isNaN(opts.merge_size)) {
    opts.merge_size = 5;
  }

  moduleConfig = opts;

  //monit监控注册数
  let probe = pmx.probe();
  probe.metric({
    name: '有效webhook',
    value: function () {
      return opts.enabled ? Object.keys(processList).join(',') : '全局停用中';
    }
  });
  probe.metric({
    name: '消息缓冲区',
    value: function () {
      return messages.length;
    }
  });

  //定时任务 检查进程、推送消息
  pm2.connect((err) => {
    if (err) {
      console.error('error', err)
      process.exit(-1);
    }

    if (!opts.enabled) {
      console.warn(`${opts.module_name}已停用，如需启用请执行：pm2 set ${opts.module_name}:enabled true`);
      return;
    }

    console.log(opts.module_name, 'connected');

    //定时监测进程
    setInterval(() => {
      pm2.list((err, updateProcess));
    }, opts.interval_check);

    //定时push
    setInterval(webhookPush, opts.interval_push);

  });

  //日志事件
  pm2.launchBus(function (err, bus) {

    if (!opts.enabled) {
      return;
    }


    bus.on('log:out', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.log_out) {
        addMessage(data, 'out');
      }
    });

    bus.on('log:err', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.log_error) {
        addMessage(data, 'err');
      }
    });

    bus.on('log:kill', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.log_kill) {
        addMessage(data, 'kill');
      }
    });

    bus.on('process:exception', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_exception) {
        addMessage(data, 'exception');
      }
    });

    bus.on('process:event', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_event) {
        addMessage(data, 'event');
      }
    });

    bus.on('process:msg', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_msg) {
        addMessage(data, 'msg');
      }
    });

    // Start the message processing
    //processQueue();

  });

  //模块重启
  pm2.reloadLogs(function (err, result) {
    console.log('模块reload', err, result);
  })

});


/**
 * 更新进程webhook注册数以及进程配置
 *
 * @param {*} a
 * @param {*} procs
 */
function updateProcess(a, procs) {
  for (let proc of procs) {
    if (!proc.pm2_env || !proc.pm2_env.webhook_url || !proc.pm2_env.webhook_url.startsWith('http')) {
      //console.log(proc.name, 'webhooks配置异常，已忽略', proc.pm2_env.webhook);
      continue;
    }

    //配置项
    processList[proc.name] = {
      log_out: proc.pm2_env.webhook_log_out, //普通消息
      log_error: proc.pm2_env.webhook_log_error, //error消息
      log_kill: proc.pm2_env.webhook_log_kill, //进程结束
      process_exception: proc.pm2_env.webhook_process_exception, //进程异常
      process_event: proc.pm2_env.webhook_process_event, //进程事件
      process_msg: proc.pm2_env.webhook_process_msg, //进程消息
      mobiles: proc.pm2_env.webhook_mobiles || '', //@手机号
      url: proc.pm2_env.webhook_url || '', //webhook地址
      type: proc.pm2_env.webhook_type || '' //webhook类型：dingtalk、weixin
    };

    //console.log('processList:', processList);
  }
}

/**
 * 向消息缓冲器写入消息
 *
 * @param {*} data  消息对象
 * @param {*} type  消息类型（out err等）
 */
function addMessage(data, type) {
  messages.push({
    pname: data.process.name,
    pid: data.process.pm_id,
    type: type,
    data: data.event || data.exception || data.data
  });
}

/**
 * 推送到webhook地址
 *
 * @returns
 */
async function webhookPush() {
  let data = {};
  for (let i = 0; i < moduleConfig.merge_size; i++) {
    let msg = messages.shift();
    if (!msg) {
      break;
    }
    if (!data[msg.pname]) {
      data[msg.pname] = '';
    }
    data[msg.pname] += `${msg.pname}(${msg.pid}) ${msg.type} ${msg.data} \r\n`;
  }

  let keys = Object.keys(data);
  if (keys.length == 0) {
    return;
  }

  let url;
  try {
    for (let key of keys) {

      let cfg = processList[key];
      if (!cfg) {
        continue;
      }
      cfg.mobiles = cfg.mobiles || '';

      let webhookData;
      switch (cfg.type) {
        case 'dingtalk':
          webhookData = buildDingtalkData(cfg, `[${os.hostname()}] ${data[key]}`);
          break;
        case 'weixin':
          webhookData = buildWeixinData(cfg, `[${os.hostname()}] ${data[key]}`);
          break;
        default:
          console.error('webhook_type无效：', cfg);
          continue;
      }

      url = cfg.url; //用于异常后打印日志
      http.postJSON(url, webhookData);
    }
  } catch (error) {
    console.error('post发送异常:', url, error);
  }
}

/**
 * 构造钉钉消息体
 *
 * @param {*} cfg webhook配置
 * @param {*} message
 * @returns
 */
function buildDingtalkData(cfg, message) {
  return {
    "msgtype": "text",
    "text": {
      "content": message
    },
    "at": {
      "atMobiles": cfg.mobiles.split(','),
      "isAtAll": false
    }
  };
}


/**
 * 构造微信消息体
 *
 * @param {*} cfg webhook配置
 * @param {*} message
 * @returns
 */
function buildWeixinData(cfg, message) {
  return {
    msgtype: 'text',
    text: {
      content: message.length > 2000 ? '**截取前2000字符**' + message.substr(0, 2000) : message,
      mentioned_list: [],
      mentioned_mobile_list: cfg.mobiles.split(',')
    }
  };
}