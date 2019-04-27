'use strict';

const pm2 = require('pm2');
const pmx = require('pmx');
const os = require('os');

let processList = {};
let messages = [];  //at,pname,pid,data
let moduleConfig = {};

pmx.initModule({

  // Options related to the display style on Keymetrics
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

  if (isNaN(opts.interval_check) || opts.interval_check < 10) {
    opts.interval_check = 5000;
  }

  if (isNaN(opts.interval_push) || opts.interval_push < 1000) {
    opts.interval_check = 5000;
  }

  if (isNaN(opts.merge_size)) {
    opts.interval_check = 5;
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

  //定时检查进程
  pm2.connect((err) => {
    if (err) {
      console.error('error', err)
      process.exit(-1);
    }

    if (!opts.enabled) {
      console.warn('pm2-webhooks已停用，如需启用请执行：pm2 set pm2-webhooks:enabled true');
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
        addMessage(data);
      }
    });

    bus.on('log:err', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.log_error) {
        addMessage(data);
      }
    });

    bus.on('log:kill', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.log_kill) {
        addMessage(data);
      }
    });

    bus.on('process:exception', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_exception) {
        addMessage(data);
      }
    });

    bus.on('process:event', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_event) {
        addMessage(data);
      }
    });

    bus.on('process:msg', function (data) {
      let cfg = processList[data.process.name];
      if (cfg && cfg.process_msg) {
        addMessage(data);
      }
    });

    // Start the message processing
    //processQueue();

  });

  pm2.reloadLogs(function (err, result) {
    console.log('reload', err, result);
  })

});


/**
 * 更新进程webhook注册数
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

    processList[proc.name] = {
      log_out: proc.pm2_env.webhook_log_out,
      log_error: proc.pm2_env.webhook_log_error,
      log_kill: proc.pm2_env.webhook_log_kill,
      process_exception: proc.pm2_env.webhook_process_exception,
      process_event: proc.pm2_env.webhook_process_event,
      process_msg: proc.pm2_env.webhook_process_msg,
      mobiles: proc.pm2_env.webhook_mobiles,
      url: proc.pm2_env.webhook_url
    };

    //console.log('processList:', processList);
  }
}

function addMessage(data) {
  messages.push({
    pname: data.process.name,
    pid: data.process.pm_id,
    data: data.event || data.exception || data.data
  });
}


function webhookPush() {
  let data = {};
  for (let i = 0; i < moduleConfig.merge_size; i++) {
    let msg = messages.shift();
    if (!msg) {
      break;
    }
    if (!data[msg.pname]) {
      data[msg.pname] = '';
    }
    data[msg.pname] += `${msg.pname}(${msg.pid}) ${msg.data} \r\n`;
  }

  let keys = Object.keys(data);
  if (keys.length == 0) {
    return;
  }

  for (let key of keys) {
    sendToDingtalk(key, data[key]);
  }
}

/**
 * 发送到钉钉
 *
 * @param {*} pname
 * @param {*} message
 * @returns
 */
function sendToDingtalk(pname, message) {
  let cfg = processList[pname];
  if (!cfg) {
    return;
  }

  cfg.mobiles = cfg.mobiles || [];

  let data = {
    "msgtype": "text",
    "text": {
      "content": `[${os.hostname()}] ${message}`
    },
    "at": {
      "atMobiles": cfg.mobiles.split(','),
      "isAtAll": false
    }
  };

  let http = cfg.url.startsWith('https://') ? require('https') : require('http');

  try {
    let req = http.request(cfg.url, {
      headers: {
        'Content-Type': 'application/json;charset=utf-8'
      },
      method: 'POST',
      timeout: 60000
    });

    req.on('error', (e) => {
      console.error(`钉钉请求失败: ${e.message}`);
    });

    req.write(JSON.stringify(data));
    req.end();
  } catch (error) {
    console.error(`钉钉请求异常: ${error.message}`);
  }
}
