// ==UserScript==
// @name         Mixamo.com
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Mixamo.com全站下载，不包括动作集合
// @author       https://github.com/gzlock/
// @match        https://www.mixamo.com/
// @grant        MIT
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @require      https://cdn.bootcss.com/lodash.js/4.17.4/lodash.min.js
// ==/UserScript==



/*使用方法：

// 新账号

// 1, 获取所有store的动作预览图（每个动作两张），必须步骤
_.range(1,27).forEach(page=>{ GetStoreList(page,GetStoreItemThumbnail) });

// 2, 然后从资源库的动作列表获取下载地址，提交到Aria2c
_.range(1,28).forEach(page=>{ GetAssetList(page,AssetItemDownload) });

//统计下载的文件夹总数
folderList.length;
*/


(function(){

    var socket = new WebSocket('ws://localhost:6800/jsonrpc');
    var folderPath= '/Volumes/HDD/Animations/';
    window.folderData = {};
    window.folderList = [];
    window.downloadCount = 0;

    //将Store整页的动作加入到资源库
    window.GetStoreList=function(page,callback){
        var pageUrl = 'https://www.mixamo.com/api/v1/products?page={page}&limit=96';
        pageUrl = pageUrl.replace('{page}',page);
        $.get(pageUrl).done(function(data){
            data.results.forEach(item=>{
                if(item.type == 'Motion'){//单个动作
                    callback(item);
                }
            });
        });
    };

    //将单个动作添加到资源库库
    window.AddToAsset = function (item){
        $.post('https://www.mixamo.com/api/v1/cart/items',{product_id:item.id,character_id:'bcec63d1-ba21-11e4-ab39-06dac1a48deb'});
    };

    //重新将单个动作添加到资源库（删过动作后无法再通过上面的function添加到资源库）
    window.ReAddToAsset = function (item){
        var url = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page=1&character_id=bcec63d1-ba21-11e4-ab39-06dac1a48deb&motion_id={motion_id}&revive=true';
        url = url.replace('{motion_id}',item.motion_id);
        $.get(url).done(data=>{
            if(data.results.length===0){
                console.log('遇到了没有结果的操作',JSON.stringify(item));
            }
        });
    };

    window.Thumbnail = {};
    //获取单个动作的预览gif
    window.GetStoreItemThumbnail = function(item){
        window.Thumbnail[item.id] = [item.thumbnail, item.thumbnail_animated];
    };

    //删除资源库的资源，按整页删除
    window.RemoveAssetList = function(page){
        var pageUrl = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page={page}';
        pageUrl = pageUrl.replace('{page}',page);

        $.get(pageUrl).done(function(data){
            var ids = [];
            var list =data.results;
            for(var i = 0;i<list.length;i++){
                ids.push(list[i].id);
            }
            $.post('https://www.mixamo.com/api/v1/assets/delete',{ids:ids});
        });
    };

    //获取资源整页的动作
    window.GetAssetList=function(page,callback){
        var pageUrl = 'https://www.mixamo.com/api/v1/assets?type=Motion%2CMotionSet&limit=96&page={page}';
        pageUrl = pageUrl.replace('{page}',page);
        $.get(pageUrl).done(function(data){
            var list = data.results;
            for(var i = 0;i < list.length;i++){
                if(list[i].type == 'Motion')
                    callback(page, list[i]);
            }
            // data.results.forEach(item=>{
            //     callback(page,item);
            // });
        });
    };

    //将资源id添加到下载列表
    window.PostToDownload=function(page,item){
        var url = 'https://www.mixamo.com/api/v1/assets/{id}/download';
        url = url.replace('{id}',item.id);
        $.ajax({
            url: url,
            contentType: "application/json; charset=utf-8",
            type: "POST",
            dataType: "json",
            data: JSON.stringify({"download_settings":{"format":"fbx7","fps":30,"skin":false,"reducekf":0}}),
        }).fail(function() {
            console.error('提交失败',{page:page,item:JSON.stringify(item)});
        });
    };

    //socket aria2c 下载资源

    // Connection opened
    socket.addEventListener('open', function (event) {
        console.log('已经连接上Aria2c');
    });

    function uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = (c === 'x') ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    //发送下载命令到Aria2c
    window.AssetItemDownload = function (page,item) {
        downloadCount++;
        var folder;
        var fileName = item.name.toLowerCase();
        fileName = fileName.replace(/[\\/:*?"<>|]/g,'_');
        if(folderData.hasOwnProperty(fileName)){
            folderData[fileName]++;
            folder = fileName +' ' + folderData[fileName];
        }else{
            folder = fileName;
            folderData[fileName]=0;
        }
        folderList.push(folder);
        folder = folderPath + folder;

        //下载动作本体文件
        var download = {jsonrpc:'2.0',method:'aria2.addUri',id:uuid(),
                        params:[[item.download_url],{out:fileName+'.fbx',dir:folder,split:1,"max-connection-per-server":1}]};
        socket.send(JSON.stringify(download));

        //下载预览图
        download = {jsonrpc:'2.0',method:'aria2.addUri',id:uuid(),
                    params:[[window.Thumbnail[item.payload_id][0]],{dir:folder,split:1,"max-connection-per-server":1}]};
        socket.send(JSON.stringify(download));

        //下载预览图
        download = {jsonrpc:'2.0',method:'aria2.addUri',id:uuid(),
                    params:[[window.Thumbnail[item.payload_id][1]],{dir:folder,split:1,"max-connection-per-server":1}]};
        socket.send(JSON.stringify(download));
    };

})();