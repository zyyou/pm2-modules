
//仪表盘
function dashboardChart(id,dashboardData,name,isInit) {
    var chartId = echarts.init(document.getElementById(id));
    if(isInit){
        chartId.setOption({
            title:{
                text:name
            },
            series:[{
                data:dashboardData
            }]
        })
        return
    }
    option={
        title: {
            text:name,
            x:"center",
            y:"35%",
            textStyle: {
                color:"#333",
                fontSize:12,
                fontWeight:400
                
            }
        },
        series: [{
            type: 'gauge',
            //仪表盘轴线样式
            axisLine: {
                lineStyle: {
                    width: 18
                }
            },
            detail: {
                formatter: "{score|{value}%}",
                height: 20,
                width: 60,
                //数值样式
                rich: {
                    score: {
                        color: "red",
                        fontFamily: "微软雅黑",
                        fontSize: 12
                    }
                }
            },
            data: dashboardData,
            //表针中心圆点
            markPoint: {
                symbol: 'circle',
                symbolSize: 5,
                data: [
                    //跟你的仪表盘的中心位置对应上，颜色可以和画板底色一样
                    {
                        x: 'center',
                        y: 'center',
                        itemStyle: {
                            color: '#FFF'
                        }
                    }
                ]
            },
        }]
    }
    chartId.setOption(option);
    
}

//饼状图eacharts 
function pieChart(id, title, data,isInit) {
    var chartId = echarts.init(document.getElementById(id));
    if(isInit){
        chartId.setOption({
            legend:{
                data: title
            },
            series:[{
                data:data
            }]
        })
        return
    }
    option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },

        },
        legend: {
            show: true,
            orient: 'vertical',
            x: 'left',
            data: title
        },
        series: [{
            name: 'cpu',
            type: 'pie',
            radius: ['50%', '70%'],
            avoidLabelOverlap: false,
            label: {
                normal: {
                    show: false,
                    position: 'center'
                },
                emphasis: {
                    show: true,
                    textStyle: {
                        fontSize: '14',
                        fontWeight: 'bold'
                    }
                }
            },
            labelLine: {
                normal: {
                    show: false
                }
            },
            data: data,
            itemStyle: {
                emphasis: {
                    shadowBlur: 10,
                    shadowOffsetX: 0,
                    shadowColor: 'rgba(0, 0, 0, 0.5)'
                },
                normal: {
                    color: function (params) {
                        //自定义颜色
                        var colorList = [
                            '#63A0A7', '#C03636', "#304553"
                        ];
                        return colorList[params.dataIndex]
                    }
                }
            }
        }]
    };
    chartId.setOption(option);
}
//柱状图
function histogram(id,title, data,isInit) {
    var chartId = echarts.init(document.getElementById(id));
    if(isInit){
        chartId.setOption({
            xAxis: [{
                data: title
            }],
            series:data
        })
        return
    }
    option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'shadow'
            },
            extraCssText: 'width:auto;height:auto;',
            lineStyle: {
                color: '#FFF',
                width: 2,
                type: 'solid'
            },
            crossStyle: {
                color: '#1e90ff',
                width: 1,
                type: 'dashed'
            },
            shadowStyle: {
                color: 'rgba(150,150,150,0.3)',
                width: 'auto',
                type: 'default'
            },
        },
        legend: {
            data: ["用户", '系统', '空闲']
        },
        xAxis: [{
            type: 'category',
            data: title
        }],
        yAxis: [{
            type: 'value'
        }],
        series: data

    };
    chartId.setOption(option);
}


//tab切换
function tabToggle(event) {
    var that = event.target;
    $(that).addClass("active").siblings().removeClass("active");
    $('[data-menu="tabcon"] .tabcon-item').eq($(event.target).index()).show().siblings().hide();

}

//processesTab(event)
function processesTab(event) {
    var that = event.target;
    $(that).addClass("active").siblings().removeClass("active");
    $('.processes-con .processes-item').eq($(event.target).index()).show().siblings().hide();
}