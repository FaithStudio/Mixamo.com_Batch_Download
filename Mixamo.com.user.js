// ==UserScript==
// @name         Mixamo.com
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Mixamo.com全站下载，不包括动作集合
// @author       https://github.com/gzlock/
// @match        https://www.mixamo.com/*
// @grant        MIT
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @require      https://cdn.bootcss.com/lodash.js/4.17.4/lodash.min.js
// @require      https://cdn.bootcss.com/async/2.5.0/async.min.js
// ==/UserScript==

$(function(){

    const socket = new WebSocket('ws://localhost:6800/jsonrpc');
    let folderPath= '/Volumes/HDD/Animations/';
    window.folderData = {};
    window.folderList = [];
    window.downloadCount = 0;

    //将Store整页的动作加入到资源库
    window.GetStoreList=function(callback){
        const pageUrl = 'https://www.mixamo.com/api/v1/products?page={page}&limit=96';
        const funs = [];
        let items = [];
        $.get('https://www.mixamo.com/api/v1/products?page=1&limit=96').done(data=>{
            _.range(1, data.pagination.num_pages+1).forEach(page=>{
                funs.push(callback=>{
                    let url = pageUrl.replace('{page}',page);
                    $.get(url).done(data=>{
                        items = items.concat(data.results);
                        callback();
                    });
                });
            });
            async.parallel(funs,()=>{
                callback(items);
            });
        });
    };

    //将单个动作添加到资源库库
    window.AddToAsset = function (item, characterID, callback){
        let ajax = $.post('https://www.mixamo.com/api/v1/cart/items',{product_id:item.id,character_id:characterID});
        if(callback)
            ajax.always(callback);
    };

    //重新将单个动作添加到资源库
    window.ReAddToAsset = function (item, characterID, callback){
        let url = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page=1&character_id={characterID}&motion_id={motion_id}&revive=true';
        url = url.replace('{motion_id}',item.motion_id);
        url = url.replace('{characterID}',characterID);
        let ajax = $.get(url);
        if(callback)
            ajax.always(callback);
    };

    //清空资源库的动作
    window.RemoveAssetList = function(callback){
        const pageUrl = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page={page}';
        const funs = [];
        const ids = [];
        $.get('https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page=1').done(function(data){
            _.range(1,data.pagination.num_pages+1).forEach(page=>{
                funs.push(callback=>{
                    let url = pageUrl.replace('{page}',page);
                    $.get(url).done(data=>{
                        data.results.forEach(item=>{ids.push(item.id);});
                        callback();
                    });
                });
            });
            async.parallel(funs,(err,result)=>{
                let ajax = $.post('https://www.mixamo.com/api/v1/assets/delete',{ids:ids}).always(()=>{
                    console.log('清空动作资源库 完成');
                    if(callback)
                        callback();
                });
            });
        });
    };

    //清空下载队列的内容
    window.RemoveDownload = function(callback){
        const pageUrl = 'https://www.mixamo.com/api/v1/assets?limit=96&page={page}&status=success%2Cprocessing%2Cfailure&favorited=true';
        const ids = [];
        const funs = [];
        $.get('https://www.mixamo.com/api/v1/assets?limit=96&page=1&status=success%2Cprocessing%2Cfailure&favorited=true').done(data=>{
            _.range(1,data.pagination.num_pages+1).forEach(page=>{
                funs.push(callback=>{
                    let url = pageUrl.replace('{page}',page);
                    $.get(url).done(data=>{
                        data.results.forEach(item=>{ids.push(item.id);});
                        callback();
                    });
                });
            });
            async.parallel(funs,()=>{
                $.post('https://www.mixamo.com/api/v1/assets/clear-download',{ids:ids}).always(()=>{
                    console.log('清空下载队列 完成');
                    if(callback)
                        callback();
                });
            });
        });
    };

    //获取整页资源的动作
    window.GetAssetList=function(callback){
        const pageUrl = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page={page}';
        const funs = [];
        let items = [];
        $.get('https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page=1').done(data=>{
            _.range(1,data.pagination.num_pages+1).forEach(page=>{
                funs.push(cb=>{
                    let url = pageUrl.replace('{page}',page);
                    $.get(url).done(data=>{
                        items = items.concat(data.results);
                        cb();
                    });
                });
            });
            async.parallel(funs,()=>{
                console.log('GetAssetList',items.length);
                callback(items);
            });
        });
    };

    //将资源id添加到下载列表
    window.PostToDownload=function(item,callback){
        let url = 'https://www.mixamo.com/api/v1/assets/{id}/download';
        url = url.replace('{id}',item.id);
        let ajax = $.ajax({
            url: url,
            contentType: "application/json; charset=utf-8",
            type: "POST",
            dataType: "json",
            data: JSON.stringify({"download_settings":{"format":"fbx7","fps":30,"skin":false,"reducekf":0}}),
        });
        if(callback)
            ajax.always(callback);
    };

    //socket aria2c 下载资源

    // Connection opened
    socket.addEventListener('open', function (event) {
        console.log('已经连接上Aria2c');
    });

    //发送下载命令到Aria2c
    let id = 0;
    window.DownloadFile = function (item) {
        id++;
        //下载动作本体文件
        var download = {jsonrpc:'2.0',method:'aria2.addUri',id:id+'_1',
                        params:[[item.file],{out:item.name+'.fbx',dir:item.folder,split:1,"max-connection-per-server":1}]};
        socket.send(JSON.stringify(download));

        //下载预览图
        download = {jsonrpc:'2.0',method:'aria2.addUri',id:id+'_2',
                    params:[[item.image],{out:item.name+'.gif',dir:item.folder,split:1,"max-connection-per-server":1}]};
        socket.send(JSON.stringify(download));

        //下载预览图
        // download = {jsonrpc:'2.0',method:'aria2.addUri',id:id+'_3',
        //             params:[[item.images[1]],{dir:item.folder,split:1,"max-connection-per-server":1}]};
        // socket.send(JSON.stringify(download));
    };

    //获取所有账号资源库中的所有角色
    window.GetCharacters = function GetCharacters(callback){
        let items = [];
        const funs = [];
        const pageUrl = 'https://www.mixamo.com/api/v1/assets?type=Character&limit=96&page={page}';
        $.get('https://www.mixamo.com/api/v1/assets?type=Character&limit=48&page=1').done(data=>{
            _.range(1,data.pagination.num_pages+1).forEach(page=>{
                funs.push(cb=>{
                    let url = pageUrl.replace('{page}',page);
                    $.get(url).done(data=>{
                        items = items.concat(data.results);
                        cb();
                    });
                });
            });
            async.parallel(funs,()=>{
                callback(items);
            });
        });
    };

    InitElement();
    /**
    初始化所需的HTML元素
    */
    function InitElement(){
        const $target = $('.asset-download-actions');
        if(!$target)
            return;

        //清空下载队列 按钮
        const $clearDownload = $('<button class="pull-right btn btn-default">清空下载</button>');
        $clearDownload.click(()=>{
            if(confirm('确定清空下载队列中的所有项目?')){
                window.RemoveDownload();
            }
        });
        $target.append($clearDownload);

        //清空资源库 按钮
        const $clearAsset = $('<button class="pull-right btn btn-default">清空动作资源库</button>');
        $clearAsset.click(()=>{
            if(confirm('确定清空资源库的所有动作?')){
                window.RemoveAssetList();
            }
        });
        $target.append($clearAsset);

        //从下载队列下载文件 按钮
        const $downloadToFile = $('<button class="pull-right btn btn-default">从下载队列下载文件</button>');
        $downloadToFile.click(()=>{
            let path = window.prompt('要把文件放到哪',folderPath);
            if(_.isEmpty(path))
                return alert('取消下载或路径为空');
            if(path.lastIndexOf('/')!=path.length-1);
            path +='/';
            const files = {};
            const sameName = {};//重名检测
            //从Store的item获取到预览图片,串行操作
            async.series([
                cb=>{GetAssetList(items=>{//获取下载文件网址，初始化其它数据
                    items.forEach(item=>{
                        let fileName = item.name.toLowerCase().replace(/[\\/:*?"<>|]/g,'_');
                        let folder;
                        if(sameName.hasOwnProperty(fileName)){
                            sameName[fileName]++;
                            folder = fileName + sameName[fileName];
                        }else{
                            sameName[fileName] = 0;
                            folder = fileName;
                        }
                        files[item.payload_id] = {
                            file:item.download_url,
                            name:fileName,
                            folder:path+folder,
                            image:'http:'+item.thumbnail,
                        };
                    });
                    console.log('下载files',Object.keys(files).length);
                    cb();
                    });
                },
                // 从Store获取预览无效，因为无法对应到Asset的item
                // cb=>{
                //     GetStoreList(items=>{//从Store中获取预览图片
                //         items.forEach(item=>{
                //             files[item.id].images=[item.thumbnail,item.thumbnail_animated];
                //         });
                //         cb();
                //     });
                // },
                cb=>{
                    for(let key in files){
                        DownloadFile(files[key]);
                    }
                    cb();
                },
            ],()=>{
                const num = Object.keys(files).length;
                console.log('一共有 '+num+' 个文件夹');
                console.log('一共有 '+(num*2)+' 个文件');
            });
        });
        $target.append($downloadToFile);

        //把资源库动作提交到下载队列 按钮
        const $AssetToDownload = $('<button class="pull-right btn btn-default">把所有资源添加到下载队列</button>');
        $AssetToDownload.click(()=>{
            if(socket.readyState !== 1)
                return alert('无法连接到Aria2c，不能批量下载');
            let count = 0;
            const queue = async.queue((task,cb)=>{task(cb);},20);
            queue.drain=()=>{
                console.log('所有资源已经提交到下载队列,一共有',count);
            };
            GetAssetList(items=>{
                items.forEach(item=>{
                    count++;
                    queue.push(cb=>{
                        PostToDownload(item,cb);
                    });
                });
            });
        });
        $target.append($AssetToDownload);

        //选择角色后创建所有动作到资源库 下拉选择框
        const $CreateCharacterMotions = $('<div class="pull-right btn btn-default"><select><option value="0">选择一个角色创建所有动作</option></select></div>');
        GetCharacters(characters=>{
            const $select = $CreateCharacterMotions.find('select');
            characters.forEach(c=>{
                $select.append('<option value="'+c.character_id+'">'+c.name+'</option>');
            });
            $target.append($CreateCharacterMotions);
        });
        $CreateCharacterMotions.change(()=>{
            const characterID = $CreateCharacterMotions.find('option:selected').val();
            if(_.isEmpty(characterID) || characterID=='0')
                return;
            const funs = [];
            const queue = async.queue(function(task, callback) {
                task(callback);
            }, 20);
            queue.drain = function() {
                console.log('角色的动作已经全部添加到资源库，可以执行提交到下载队列的操作');
            };
            GetStoreList(items=>{
                items.forEach(item=>{
                    queue.push([cb=>{AddToAsset(item,characterID,cb);},cb=>{ReAddToAsset(item,characterID,cb);}]);
                });
                console.log('一共'+queue.length()+'个任务');
            });
        });

    }

});
