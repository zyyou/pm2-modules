'use strict';
const mvcrouter = require('koa-mvcrouter')();

//index controller中建议只写此action
mvcrouter.viewGET('/', function (ctx) {
  return {
    title: '首页'
  };
});


module.exports = mvcrouter;