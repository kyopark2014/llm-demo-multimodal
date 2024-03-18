const protocol = 'WEBSOCKET'; // WEBSOCKET 
const langstate = 'korean'; // korean or english

// Common
let userId = localStorage.getItem('userId'); // set userID if exists 
if(userId=="") {
    userId = uuidv4();
}
console.log('userId: ', userId);

// earn endpoint 
let endpoint = localStorage.getItem('wss_url');
if(endpoint=="") {
    console.log('provisioning is required!');
}
console.log('endpoint: ', endpoint);

let webSocket
let isConnected;

if(protocol == 'WEBSOCKET') {
    webSocket = connect(endpoint, 'initial');
} 

// earn voice endpoint 
let voiceEndpoint = localStorage.getItem('voice_wss_url');
if(voiceEndpoint=="") {
    console.log('voice provisioning is required!');
}
console.log('voiceEndpoint: ', voiceEndpoint);

let voiceWebSocket
let isVoiceConnected;
if(protocol == 'WEBSOCKET') {
    voiceWebSocket = voiceConnect(voiceEndpoint, 'initial');
}

console.log('feedback...');
const feedback = document.getElementById('feedback');
feedback.style.display = 'none'; 

HashMap = function() {
    this.map = new Array();
};

HashMap.prototype = {
    put: function(key, value) {
        this.map[key] = value;
    },
    get: function(key) {
        return this.map[key];
    },
    size: function() {
        var keys = new Array();
        for(i in this.map) {
            keys.push(i);
        }
        return keys.length;
    },
    remove: function(key) {
        delete this.map[key];
    },
    getKeys: function() {
        var keys = new Array();
        for(i in this.map) {
            keys.push(i);
        }
        return keys;
    }
};

let undelivered = new HashMap();
let retry_count = 0;
function sendMessage(message) {
    if(!isConnected) {
        console.log('reconnect...'); 
        webSocket = connect(endpoint, 'reconnect');
        
        if(langstate=='korean') {
            addNotifyMessage("재연결중입니다. 연결후 자동 재전송합니다.");
        }
        else {
            addNotifyMessage("We are connecting again. Your message will be retried after connection.");                        
        }

        undelivered.put(message.request_id, message);
        console.log('undelivered message: ', message);
        
        return false
    }
    else {
        webSocket.send(JSON.stringify(message));     
        console.log('message: ', message);   

        return true;
    }     
}

let tm;
function ping() {
    console.log('->ping');
    webSocket.send('__ping__');
    tm = setTimeout(function () {
        console.log('reconnect...');    
        
        isConnected = false
        webSocket = connect(endpoint, 'reconnect');
        
    }, 5000);
}
function pong() {
    clearTimeout(tm);
}

let voiceTm;
function voicePing() {
    console.log('->voice ping');
    voiceWebSocket.send('__ping__');
    voiceTm = setTimeout(function () {
        console.log('voice reconnect...');    
        
        isVoiceConnected = false
        voiceWebSocket = voiceConnect(voiceEndpoint, 'reconnect');
        
    }, 5000);
}
function voicePong() {
    clearTimeout(voiceTm);
}

function connect(endpoint, type) {
    const ws = new WebSocket(endpoint);

    // connection event
    ws.onopen = function () {
        console.log('connected...');
        isConnected = true;

        if(undelivered.size() && retry_count>0) {
            let keys = undelivered.getKeys();
            console.log('retry undelived messags!');            
            console.log('keys: ', keys);
            console.log('retry_count: ', retry_count);

            for(i in keys) {
                let message = undelivered.get(keys[i])
                console.log('message', message)
                if(!sendMessage(message)) break;
                else {
                    undelivered.remove(message.request_id)
                }
            }
            retry_count--;
        }
        else {
            retry_count = 3
        }

        if(type == 'initial')
            setInterval(ping, 40000);  // ping interval: 40 seconds
    };

    // message 
    ws.onmessage = function (event) {     
        isConnected = true;   
        if (event.data.substr(1,8) == "__pong__") {
            console.log('<-pong');
            pong();
            return;
        }
        else {
            response = JSON.parse(event.data)

            if(response.status == 'completed') {          
                feedback.style.display = 'none';       
                console.log('current: '+action+'next: '+response.msg);
                   
                addReceivedMessage(response.request_id, response.msg);  

                if (action == 'general' && response.action != 'general') { // do action
                    action = response.action                      
                    console.log('start action: ', action)                    
                    do_action(action)
                }
                else if(action != 'general' && response.action == 'general') {   // clear action
                    console.log('stop action: ', action)
                    clear_timer()
                }
                else if(action != response.action) { // exchange action
                    console.log('exchange action from' + action + ' to '+ response.action)
                    clear_timer()
                    action = response.action  
                    do_action(action)
                }
                else {  // remain action
                    console.log('remain current action: ', response.action)
                }
            }          
            else if(response.status == 'istyping') {
                feedback.style.display = 'inline';
                // feedback.innerHTML = '<i>typing a message...</i>'; 
            }
            else if(response.status == 'proceeding') {
                feedback.style.display = 'none';
                addReceivedMessage(response.request_id, response.msg);                
            }                
            else if(response.status == 'debug') {
                feedback.style.display = 'none';
                console.log('debug: ', response.msg);
                // addNotifyMessage(response.msg);
                addReceivedMessage(response.request_id, response.msg);  
            }          
            else if(response.status == 'error') {
                feedback.style.display = 'none';
                console.log('error: ', response.msg);
                addNotifyMessage(response.msg);
            }   
        }        
    };

    // disconnect
    ws.onclose = function () {
        console.log('disconnected...!');
        isConnected = false;

        ws.close();
        console.log('the session will be closed');
    };

    // error
    ws.onerror = function (error) {
        console.log(error);
        isConnected = false;

        ws.close();
        console.log('the session will be closed');
    };

    return ws;
}

let listMessages = new HashMap(); 
function voiceConnect(voiceEndpoint, type) {
    const ws = new WebSocket(voiceEndpoint);

    // connection event
    ws.onopen = function () {
        console.log('voice connected...');
        isVoiceConnected = true;

        // request initiation of redis
        let requestObj = {
            "user_id": userId,
            "type": "initiate"
        }
        voiceWebSocket.send(JSON.stringify(requestObj));
    
        if(type == 'initial')
            setInterval(voicePing, 40000);  // ping interval: 40 seconds
    };

    // message 
    ws.onmessage = function (event) {     
        isConnected = true;   
        if (event.data.substr(1,8) == "__pong__") {
            console.log('<-voice pong');
            voicePong();
            return;
        }
        else {
            response = JSON.parse(event.data)

             if(response.status == 'redirected') {    
                feedback.style.display = 'none';      
                console.log('response: ', response);
                
                let msg = JSON.parse(response.msg)
                requestId = msg.requestId;
                query = msg.query;
                state = msg.state;

                console.log('requestId: ', requestId);
                console.log('query: ', query);

                let current = new Date();
                let datastr = getDate(current);
                let timestr = getTime(current);
                let requestTime = datastr+' '+timestr

                let previous = listMessages.get(requestId); 
                console.log('length: (previous)'+previous.length+', new:'+query.length);
                if(query.length > previous.length) {
                    addSentMessage(requestId, timestr, query);

                    if(protocol == 'WEBSOCKET' && state=='completed') {
                        sendMessage({
                            "user_id": userId,
                            "request_id": requestId,
                            "request_time": requestTime,        
                            "type": "text",
                            "body": query,
                            "convType": conversationType
                        })
                    }
                    
                    listMessages.put(requestId, query);  
                }
                else {
                    console.log('wrong message size: ', query.length);
                }
            }      
            else if(response.status == 'error') {
                feedback.style.display = 'none';
                console.log('error: ', response.msg);
                addNotifyMessage(response.msg);
            }   
        }        
    };

    // disconnect
    ws.onclose = function () {
        console.log('voice disconnected...!');
        isVoiceConnected = false;

        ws.close();
        console.log('the voice session will be closed');
    };

    // error
    ws.onerror = function (error) {
        console.log(error);
        isVoiceConnected = false;

        ws.close();
        console.log('the voice session will be closed');
    };

    return ws;
}

let tm_action;
function do_action(action) {
    console.log('->action: ', action);

    image_processing(action);
    clear_timer();

    if(action != 'general') {
        tm_action = setTimeout(function () {
            console.log('action agin');            
            do_action(action)
    
        }, 6000);
    }    
}
function clear_timer() {
    console.log('clear action: ', action);   
    clearTimeout(tm_action);
}

// Documents
const title = document.querySelector('#title');
const sendBtn = document.querySelector('#sendBtn');
const message = document.querySelector('#chatInput')
const chatPanel = document.querySelector('#chatPanel');

let isResponsed = new HashMap();
let indexList = new HashMap();
let retryNum = new HashMap();

// message log list
let msglist = [];
let maxMsgItems = 200;
let msgHistory = new HashMap();
let callee = "AWS";
let index=0;
let action = "general"

let conversationType = localStorage.getItem('convType'); // set convType if exists 
if(conversationType=="") {
    conversationType = "normal";
}
console.log('conversationType: ', conversationType);

for (i=0;i<maxMsgItems;i++) {
    msglist.push(document.getElementById('msgLog'+i));

    // add listener        
    (function(index) {
        msglist[index].addEventListener("click", function() {
            if(msglist.length < maxMsgItems) i = index;
            else i = index + maxMsgItems;

            console.log('click! index: '+index);
        })
    })(i);
}

calleeName.textContent = "Chatbot";  
calleeId.textContent = "AWS";


if(langstate=='korean') {
    addNotifyMessage("Amazon Bedrock을 이용하여 채팅을 시작합니다.");
    addReceivedMessage(uuidv4(), "아마존 베드락을 이용하여 주셔서 감사합니다. 편안한 대화를 즐기실수 있으며, 파일을 업로드하면 요약을 할 수 있습니다.")
}
else {
    addNotifyMessage("Start chat with Amazon Bedrock");             
    addReceivedMessage(uuidv4(), "Welcome to Amazon Bedrock. Use the conversational chatbot and summarize documents, TXT, PDF, and CSV. ")           
}

// get history
function getAllowTime() {    
    let allowableDays = 2; // two day's history
    
    let current = new Date();
    let allowable = new Date(current.getTime() - 24*60*60*1000*allowableDays);  
    let allowTime = getDate(allowable)+' '+getTime(current);
    console.log('Current Time: ', getDate(current)+' '+getTime(current));
    console.log('Allow Time: ', allowTime);
    
    return allowTime;
}
let allowTime = getAllowTime();
getHistory(userId, allowTime);

// Listeners
message.addEventListener('keyup', function(e){
    if (e.keyCode == 13) {
        onSend(e);
    }
});

// refresh button
refreshChatWindow.addEventListener('click', function(){
    console.log('go back user input menu');
    window.location.href = "index.html";
});

// depart button
depart.addEventListener('click', function(){
    console.log('depart icon');
    
    deleteItems(userId);    
});

sendBtn.addEventListener('click', onSend);
function onSend(e) {
    e.preventDefault();
    
    if(message.value != '') {
        console.log("msg: ", message.value);

        let current = new Date();
        let datastr = getDate(current);
        let timestr = getTime(current);
        let requestTime = datastr+' '+timestr

        let requestId = uuidv4();
        addSentMessage(requestId, timestr, message.value);
        
        if(protocol == 'WEBSOCKET') {
            sendMessage({
                "user_id": userId,
                "request_id": requestId,
                "request_time": requestTime,        
                "type": "text",
                "body": message.value,
                "convType": conversationType
            })
        }
        else {
            sendRequest(message.value, requestId, requestTime);
        }            
    }
    message.value = "";

    chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
}

function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

(function() {
    window.addEventListener("focus", function() {
//        console.log("Back to front");

        if(msgHistory.get(callee))
            updateCallLogToDisplayed();
    })
})();

function getDate(current) {    
    return current.toISOString().slice(0,10);
}

function getTime(current) {
    let time_map = [current.getHours(), current.getMinutes(), current.getSeconds()].map((a)=>(a < 10 ? '0' + a : a));
    return time_map.join(':');
}

function addSentMessage(requestId, timestr, text) {
    if(!indexList.get(requestId+':send')) {
        indexList.put(requestId+':send', index);             
    }
    else {
        index = indexList.get(requestId+':send');
        console.log("reused index="+index+', id='+requestId+':send');        
    }
    console.log("index:", index);   

    var length = text.length;    
    console.log('length: ', length);
    if(length < 10) {
        msglist[index].innerHTML = 
            `<div class="chat-sender20 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;   
    }
    else if(length < 14) {
        msglist[index].innerHTML = 
            `<div class="chat-sender25 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;   
    }
    else if(length < 17) {
        msglist[index].innerHTML = 
            `<div class="chat-sender30 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }  
    else if(length < 21) {
        msglist[index].innerHTML = 
            `<div class="chat-sender35 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }
    else if(length < 26) {
        msglist[index].innerHTML = 
            `<div class="chat-sender40 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }
    else if(length < 35) {
        msglist[index].innerHTML = 
            `<div class="chat-sender50 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }
    else if(length < 80) {
        msglist[index].innerHTML = 
            `<div class="chat-sender60 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }  
    else if(length < 145) {
        msglist[index].innerHTML = 
            `<div class="chat-sender70 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }  
    else {
        msglist[index].innerHTML = 
            `<div class="chat-sender80 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }     

    chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
    index++;
}       

function addSentMessageForSummary(requestId, timestr, text) {  
    console.log("sent message: "+text);

    if(!indexList.get(requestId+':send')) {
        indexList.put(requestId+':send', index);             
    }
    else {
        index = indexList.get(requestId+':send');
        console.log("reused index="+index+', id='+requestId+':send');        
    }
    console.log("index:", index);   

    let length = text.length;
    if(length < 100) {
        msglist[index].innerHTML = 
            `<div class="chat-sender60 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;   
    }
    else {
        msglist[index].innerHTML = 
            `<div class="chat-sender80 chat-sender--right"><h1>${timestr}</h1>${text}&nbsp;<h2 id="status${index}"></h2></div>`;
    }   

    chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
    index++;
}  

function addReceivedMessage(requestId, msg) {
    // console.log("add received message: "+msg);
    sender = "Chatbot"
    
    if(!indexList.get(requestId+':receive')) {
        indexList.put(requestId+':receive', index);             
    }
    else {
        index = indexList.get(requestId+':receive');
        console.log("reused index="+index+', id='+requestId+':receive');        
    }
    // console.log("index:", index);   

    msg = msg.replaceAll("\n", "<br/>");

    var length = msg.length;
    console.log('msg: ', msg)
    console.log("length: ", length);

    if(length < 10) {
        msglist[index].innerHTML = `<div class="chat-receiver20 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 14) {
        msglist[index].innerHTML = `<div class="chat-receiver25 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 17) {
        msglist[index].innerHTML = `<div class="chat-receiver30 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 21) {
        msglist[index].innerHTML = `<div class="chat-receiver35 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 25) {
        msglist[index].innerHTML = `<div class="chat-receiver40 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 35) {
        msglist[index].innerHTML = `<div class="chat-receiver50 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 80) {
        msglist[index].innerHTML = `<div class="chat-receiver60 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else if(length < 145) {
        msglist[index].innerHTML = `<div class="chat-receiver70 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
    else {
        msglist[index].innerHTML = `<div class="chat-receiver80 chat-receiver--left"><h1>${sender}</h1>${msg}&nbsp;</div>`;  
    }
     
    chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
    index++;
}

function addNotifyMessage(msg) {
    console.log("index:", index);   

    msglist[index].innerHTML =  
        `<div class="notification-text">${msg}</div>`;     

    index++;

    chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
}

refreshChatWindow.addEventListener('click', function(){
    console.log('update chat window');
    // updateChatWindow(callee);
});

attachFile.addEventListener('click', function(){
    console.log('click: attachFile');

    let input = $(document.createElement('input')); 
    input.attr("type", "file");
    input.trigger('click');    
    
    $(document).ready(function() {
        input.change(function(evt) {
            var input = this;
            var url_file = $(this).val();
            var ext = url_file.substring(url_file.lastIndexOf('.') + 1).toLowerCase();
            var filename = url_file.substring(url_file.lastIndexOf('\\') + 1).toLowerCase();

            console.log('url: ' + url_file);
            console.log('filename: ' + filename);
            console.log('ext: ' + ext);

            if(ext == 'pdf') {
                contentType = 'application/pdf'           
            }
            else if(ext == 'txt') {
                contentType = 'text/plain'
            }
            else if(ext == 'csv') {
                contentType = 'text/csv'
            }
            else if(ext == 'ppt') {
                contentType = 'application/vnd.ms-powerpoint'
            }
            else if(ext == 'pptx') {
                contentType = 'application/vnd.ms-powerpoint'
            }
            else if(ext == 'doc' || ext == 'docx') {
                contentType = 'application/msword'
            }
            else if(ext == 'xls') {
                contentType = 'application/vnd.ms-excel'
            }
            else if(ext == 'py') {
                contentType = 'application/x-python-code'
            }
            else if(ext == 'js') {
                contentType = 'application/javascript'
            }
            else if(ext == 'md') {
                contentType = 'text/markdown'
            }
            else if(ext == 'png') {
                contentType = 'image/png'
            }
            else if(ext == 'jpeg' || ext == 'jpg') {
                contentType = 'image/jpeg'
            }

            let current = new Date();
            let datastr = getDate(current);
            let timestr = getTime(current);
            let requestTime = datastr+' '+timestr
            let requestId = uuidv4();

            let commend = message.value;
            console.log('commend: ', commend)
            if((ext == 'png' || ext == 'jpeg' || ext == 'jpg') && commend!="") {
                addSentMessageForSummary(requestId, timestr, message.value+"<br>"+"uploading the selected file in order to summerize...");

                message.value = "";
            }
            else {
                addSentMessageForSummary(requestId, timestr, "uploading the selected file in order to summerize...");
            }

            const uri = "upload";
            const xhr = new XMLHttpRequest();
        
            xhr.open("POST", uri, true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    response = JSON.parse(xhr.responseText);
                    console.log("response: " + JSON.stringify(response));
                                        
                    // upload the file
                    const body = JSON.parse(response.body);
                    console.log('body: ', body);

                    const uploadURL = body.UploadURL;                    
                    console.log("UploadURL: ", uploadURL);

                    var xmlHttp = new XMLHttpRequest();
                    xmlHttp.open("PUT", uploadURL, true);       

                    //let formData = new FormData();
                    //formData.append("attachFile" , input.files[0]);
                    //console.log('uploading file info: ', formData.get("attachFile"));

                    const blob = new Blob([input.files[0]], { type: contentType });

                    xmlHttp.onreadystatechange = function() {
                        if (xmlHttp.readyState == XMLHttpRequest.DONE && xmlHttp.status == 200 ) {
                            console.log(xmlHttp.responseText);

                            sendMessage({
                                "user_id": userId,
                                "request_id": requestId,
                                "request_time": requestTime,
                                "type": "document",
                                "body": filename,
                                "commend": commend,
                                "convType": conversationType
                            })                                                        
                        }
                        else if(xmlHttp.readyState == XMLHttpRequest.DONE && xmlHttp.status != 200) {
                            console.log('status' + xmlHttp.status);
                            alert("Try again! The request was failed.");
                        }
                    };
        
                    xmlHttp.send(blob); 
                    // xmlHttp.send(formData); 
                    console.log(xmlHttp.responseText);
                }
            };
        
            var requestObj = {
                "filename": filename,
                "contentType": contentType,
            }
            console.log("request: " + JSON.stringify(requestObj));
        
            var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});
        
            xhr.send(blob);       
        });
    });
       
    return false;
});

function sendRequest(text, requestId, requestTime) {
    const uri = "chat";
    const xhr = new XMLHttpRequest();

    isResponsed.put(requestId, false);
    retryNum.put(requestId, 12); // max 60s (5x12)

    xhr.open("POST", uri, true);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            response = JSON.parse(xhr.responseText);
            console.log("response: " + JSON.stringify(response));
            
            addReceivedMessage(response.request_id, response.msg)
        }
        else if(xhr.readyState ===4 && xhr.status === 504) {
            console.log("response: " + xhr.readyState + ', xhr.status: '+xhr.status);

            getResponse(requestId);
        }
    };

    var requestObj = {
        "user_id": userId,
        "request_id": requestId,
        "request_time": requestTime,
        "type": "text",
        "body":text,
        'action': action
    }
    console.log("request: " + JSON.stringify(requestObj));

    var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});

    xhr.send(blob);            
}

function sendRequestForSummary(object, requestId, requestTime) {
    const uri = "chat";
    const xhr = new XMLHttpRequest();

    isResponsed.put(requestId, false);
    retryNum.put(requestId, 60); // max 300s (5x60)

    xhr.open("POST", uri, true);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            response = JSON.parse(xhr.responseText);
            console.log("response: " + JSON.stringify(response));
            
            addReceivedMessage(response.request_id, response.msg)
        }
        else if(xhr.readyState ===4 && xhr.status === 504) {
            console.log("response: " + xhr.readyState + ', xhr.status: '+xhr.status);

            getResponse(requestId);
        }
        else {
            console.log("response: " + xhr.readyState + ', xhr.status: '+xhr.status);
        }
    };
    
    var requestObj = {
        "user_id": userId,
        "request_id": requestId,
        "request_time": requestTime,
        "type": "document",
        "body": object
    }
    console.log("request: " + JSON.stringify(requestObj));

    var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});

    xhr.send(blob);            
}

function delay(ms = 1000) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getResponse(requestId) {
    await delay(5000);
    
    let n = retryNum.get(requestId);
    if(n == 0) {
        console.log('Failed!')
        return;
    }
    else {
        console.log('Retry!');
        retryNum.put(requestId, n-1);
        sendRequestForRetry(requestId);
    }    
}

function sendRequestForRetry(requestId) {
    const uri = "query";
    const xhr = new XMLHttpRequest();

    xhr.open("POST", uri, true);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            response = JSON.parse(xhr.responseText);
            console.log("response: " + JSON.stringify(response));
                        
            if(response.msg) {
                isResponsed.put(response.request_id, true);
                addReceivedMessage(response.request_id, response.msg);        
                
                console.log('completed!');
            }            
            else {
                console.log('The request is not completed yet.');

                getResponse(requestId);
            }
        }
    };
    
    var requestObj = {
        "request_id": requestId,
    }
    console.log("request: " + JSON.stringify(requestObj));

    var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});

    xhr.send(blob);            
}

function getHistory(userId, allowTime) {
    const uri = "history";
    const xhr = new XMLHttpRequest();

    xhr.open("POST", uri, true);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            let response = JSON.parse(xhr.responseText);
            let history = JSON.parse(response['msg']);
            console.log("history: " + JSON.stringify(history));
                        
            for(let i=0; i<history.length; i++) {
                if(history[i].type=='text') {                
                    // let timestr = history[i].request_time.substring(11, 19);
                    let requestId = history[i].request_id;
                    console.log("requestId: ", requestId);
                    let timestr = history[i].request_time;
                    console.log("timestr: ", timestr);
                    let body = history[i].body;
                    console.log("question: ", body);
                    let msg = history[i].msg;
                    console.log("answer: ", msg);
                    addSentMessage(requestId, timestr, body)
                    addReceivedMessage(requestId, msg);                            
                }                 
            }         
            if(history.length>=1) {
                if(langstate=='korean') {
                    addNotifyMessage("대화를 다시 시작하였습니다.");
                }
                else {
                    addNotifyMessage("Welcome back to the conversation");                               
                }
                chatPanel.scrollTop = chatPanel.scrollHeight;  // scroll needs to move bottom
            }
        }
    };
    
    var requestObj = {
        "userId": userId,
        "allowTime": allowTime
    }
    console.log("request: " + JSON.stringify(requestObj));

    var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});

    xhr.send(blob);            
}

function deleteItems(userId) {
    const uri = "delete";
    const xhr = new XMLHttpRequest();

    xhr.open("POST", uri, true);
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            let response = JSON.parse(xhr.responseText);
            console.log("response: " + JSON.stringify(response));

            window.location.href = "index.html";
        }
    };
    
    var requestObj = {
        "userId": userId
    }
    console.log("request: " + JSON.stringify(requestObj));

    var blob = new Blob([JSON.stringify(requestObj)], {type: 'application/json'});

    xhr.send(blob);            
}



// Camaera UI
let audio_file = "";
let previewlist = [];
let fileList = [];
const maxImgItems = 1;
let drawingIndex = 0;
let emotionValue;
let generation;
let gender;

const previewPlayer = document.querySelector("#preview");
let canvas = document.getElementById('canvas');
canvas.width = previewPlayer.width;
canvas.height = previewPlayer.height;

let count = 0;
function videoStart() {    
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
            previewPlayer.srcObject = stream;
            console.log('video started!')
        })
}

function audioStart() {    
    navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        .then(stream => {
            console.log('audio started!')

            // use MediaStream Recording API
            const recorder = new MediaRecorder(stream);
            recorder.mimeType = 'audio/ogg'
            recorder.ondataavailable = event => {   // fires every one second and passes an BlobEvent
                const blob = event.data;  // get the Blob from the event

                console.log('recored event #', count);
                count = count + 1;

                // Create anchor tag
                var blobURL = URL.createObjectURL(blob);
                // document.write('<a href="' + blobURL + '">' + blobURL + '</a>');
                console.log('blobURL: ', blobURL)

                let downloadLink = document.createElement('a')
                downloadLink.download = 'audio'+count+'.ogg'
                downloadLink.href = blobURL
                downloadLink.click() 

                // let audio = new Audio(blob);
                // audio.play();

                // and send that blob to the server...
            };            
            recorder.start(10000); // make data available event fire every one second 
        })
}

function preview() {
    canvas.getContext('2d').drawImage(previewPlayer, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(function (blob) {
        const img = new Image();
        img.src = URL.createObjectURL(blob);

        console.log(blob);

        // downloadButton.href=img.src;
        // console.log(downloadButton.href);
        // downloadButton.download =`capture_${new Date()}.jpeg`; 
    }, 'image/png');
}

function image_processing(action) {
    canvas.getContext('2d').drawImage(previewPlayer, 0, 0, canvas.width, canvas.height);
    drawingIndex = 0;
    console.log('event for ', action);

    const uri = action;
    const xhr = new XMLHttpRequest();

    xhr.open("POST", uri, true);

    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            let result = JSON.parse(xhr.responseText);
            console.log("result: " + JSON.stringify(result));

            requestId = uuidv4();

            notification = '\n\n[도움말] Action을 멈추려면 \'그만\'이라고 하세요.'
            addReceivedMessage(requestId, result.msg+notification);   
        }
    };
    
    canvas.toBlob(function (blob) {
        xhr.send(blob);
    }, {type: 'image/png'});
}

// Camera
const startButton = document.querySelector(".start-button");
// const previewButton = document.querySelector(".preview-button");
const imageButton = document.querySelector(".image-button");
const playButton = document.querySelector(".play-button");

//event
startButton.addEventListener("click", videoStart);
imageButton.addEventListener("click", image_processing('greeting'));
playButton.addEventListener("click", playSpeech);

function getEmotion() {
    // const uri = cloudfrntUrl + "emotion";
    const uri = "greeting";
    const xhr = new XMLHttpRequest();

    xhr.open("POST", uri, true);

    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            let response = JSON.parse(xhr.responseText);
            console.log("response: " + JSON.stringify(response));

            userId = response.id;
            console.log("userId: " + userId);

            gender = response.gender;
            console.log("gender: " + gender);

            generation = response.generation;
            console.log("generation: " + generation);

            let ageRangeLow = JSON.parse(response.ageRange.Low);
            let ageRangeHigh = JSON.parse(response.ageRange.High);
            let ageRange = `Age: ${ageRangeLow} ~ ${ageRangeHigh}`; // age   
            console.log('ages: ' + ageRange);

            let smile = response.smile;
            console.log("smile: " + smile);

            let eyeglasses = response.eyeglasses;
            console.log("eyeglasses: " + eyeglasses);

            let sunglasses = response.sunglasses;
            console.log("sunglasses: " + sunglasses);

            let beard = response.beard;
            console.log("beard: " + beard);

            let mustache = response.mustache;
            console.log("mustache: " + mustache);

            let eyesOpen = response.eyesOpen;
            console.log("eyesOpen: " + eyesOpen);

            let mouthOpen = response.mouthOpen;
            console.log("mouthOpen: " + mouthOpen);

            emotionValue = response.emotions.toLowerCase();
            console.log("emotion: " + emotionValue);

            let emotionText = "Emotion: ";
            if (emotionValue == "happy") emotionText += "행복";
            else if (emotionValue == "surprised") emotionText += "놀람";
            else if (emotionValue == "calm") emotionText += "평온";
            else if (emotionValue == "angry") emotionText += "화남";
            else if (emotionValue == "fear") emotionText += "공포";
            else if (emotionValue == "confused") emotionText += "혼란스러움";
            else if (emotionValue == "disgusted") emotionText += "역겨움";
            else if (emotionValue == "sad") emotionText += "슬픔";

            let features = "Features:";
            if (smile) features += ' 웃음';
            if (eyeglasses) features += ' 안경';
            if (sunglasses) features += ' 썬글라스'; 
            if (beard) features += ' 수염';
            if (mustache) features += ' 콧수염';
            if (eyesOpen) features += ' 눈뜨고있음';
            if (mouthOpen) features += ' 입열고있음';
            console.log("features: " + features);

            let genderText;
            if (gender == 'male') genderText = '남자'
            else genderText = '여자'
            let profileText = ageRange + ' (' + genderText + ')';
            console.log("profileText: " + profileText);

            canvas.toBlob(function (blob) {
                const img = new Image();
                img.src = URL.createObjectURL(blob);

                console.log(blob);

                //    downloadButton.href = img.src;
                //    console.log(downloadButton.href);
                //    downloadButton.download = `capture_${emotionValue}_${gender}_${middleAge}_${new Date()}.jpeg`;
            }, 'image/png');

            console.log("emotion: ", emotionValue);

            getMessage();
        }
        else {
            // profileInfo_features.innerHTML = ""
        }
    };

    // console.log('uuid: ', uuid);

    canvas.toBlob(function (blob) {
        xhr.send(blob);
    });
}

function getDate(current) {    
    return current.toISOString().slice(0,10);
}

function getTime(current) {
    let time_map = [current.getHours(), current.getMinutes(), current.getSeconds()].map((a)=>(a < 10 ? '0' + a : a));
    return time_map.join(':');
}


function playSpeech() {
    console.log('event for play');

    let audio = new Audio(audio_file);
    audio.play();
}

