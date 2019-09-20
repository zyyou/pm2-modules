'use strict';
const mvcrouter = require('koa-mvcrouter')();
const moment = require('moment');
const bcklib = require('bcklib');
const pm2 = require('pm2');
const os = require('os');
const util = require('util');
const processExec = util.promisify(require('child_process').exec);

moment.locale('zh_cn');

/**
 * 根据pid检测进程端口
 *
 * @param {Number} pid
 * @returns
 */
async function getPidPort(pid) {
  let cmd;
  let portSplitChar;
  switch (process.platform) {
    case 'darwin':
      portSplitChar = '.';
      cmd = `netstat -anvp tcp |grep " ${pid} "`;
      break;
    case 'linux':
      portSplitChar = ':';
      cmd = `netstat -nap | grep " ${pid}/"`;
      break;
    default:
      return '';
  }

  let res;
  try {
    res = await processExec(cmd);
  } catch (e) {
    //console.error('无法获取进程端口', pid, e);
  }
  if (!res) {
    return '';
  }
  let outArr = res.stdout.split('\n');
  let parr = outArr[0].split(' ');
  parr = parr.filter((val) => {
    return val != '';
  });

  if (parr.length < 4) {
    console.error('端口解析失败：', pid, outArr);
  }

  let port = parr[3].split(portSplitChar);
  port = port[port.length - 1];
  return port;
}

/**
 * 获取PM2数据
 *
 * @returns
 */
async function getPM2Data() {
  let pm2Data = {
    system_info: {
      hostname: os.hostname(),
      uptime: os.uptime() //系统正常运行秒数
    },
    monit: {
      loadavg: os.loadavg(), //1、5、15分钟平均负载，少于系统逻辑CPU数目为优，仅UNIX有效
      total_mem: os.totalmem(), //系统内存字节数
      free_mem: os.freemem(), //空闲系统内存字节数
      cpu: os.cpus(),
      interfaces: os.networkInterfaces()
    }
  };
  //格式化系统启动时间
  pm2Data.system_info.uptimeStr = moment().add(pm2Data.system_info.uptime * -1, 's').format('YY-MM-DD hh:mm:ss');
  pm2Data.system_info.uptimeFromNow = moment(pm2Data.system_info.uptimeStr, 'YY-MM-DD hh:mm:ss').fromNow();

  //格式化内存
  pm2Data.monit.totalMemStr = (pm2Data.monit.total_mem / 1024 / 1024 / 1024).toFixed(2) + ' G';
  pm2Data.monit.freeMemStr = (pm2Data.monit.free_mem / 1024 / 1024 / 1024).toFixed(2) + ' G';

  pm2Data.processes = await new Promise((resolve, reject) => {
    pm2.list(async (err, list) => {
      if (err) {
        console.error('无法获取进程列表', err);
        resolve({});
      }
      for (let i = 0; i < list.length; i++) {
        list[i].memoryStr = (list[i].monit.memory / 1024 / 1024).toFixed(2) + ' M';
        list[i].uptimeStr = moment(list[i].pm2_env.pm_uptime).format('YYMMDD hh:mm:ss');
        list[i].uptimeFromNow = moment(list[i].pm2_env.pm_uptime).fromNow();
        list[i].port = await getPidPort(list[i].pid);
      }
      // list = list.map((item, index) => {
      //   item.memoryStr = (item.monit.memory / 1024 / 1024).toFixed(2) + ' M';
      //   item.uptimeStr = moment(item.pm2_env.pm_uptime).format('YYMMDD hh:mm:ss');
      //   item.uptimeFromNow = moment(item.pm2_env.pm_uptime).fromNow();
      //   item.port = await getPidPort(item.pid);
      //   return item;
      // });
      resolve(list);
    });
  });

  //console.log(pm2Data);
  return pm2Data;

}

mvcrouter.viewGET('/view', async function (ctx) {
  let data = await getPM2Data();
  data.title = 'PM2监控';
  return data;
});

mvcrouter.jsonGET('/data', async function (ctx) {
  let data = await getPM2Data();
  if (!data) {
    return bcklib.retMsg(true, '无法获取系统信息，请查看日志');
  }
  return bcklib.retMsg(false, 'ok', data);
});


module.exports = mvcrouter;