package com.example.rnagentosdemo

import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.os.Bundle
import kotlinx.coroutines.*
import com.ainirobot.agent.AgentCore
import com.ainirobot.agent.PageAgent
import com.ainirobot.agent.action.Action
import com.ainirobot.agent.action.ActionExecutor
import com.ainirobot.agent.base.Parameter
import com.ainirobot.agent.base.ParameterType
import com.ainirobot.agent.base.ActionResult
import com.ainirobot.agent.base.ActionStatus
import com.ainirobot.agent.coroutine.AOCoroutineScope
import com.ainirobot.coreservice.client.ApiListener
import com.ainirobot.coreservice.client.listener.CommandListener
import com.ainirobot.coreservice.client.listener.ActionListener
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.Definition
import com.ainirobot.coreservice.client.person.PersonApi
import com.ainirobot.coreservice.client.person.PersonListener
import com.ainirobot.coreservice.client.listener.Person
import com.ainirobot.coreservice.client.person.PersonUtils;
import android.content.Intent
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class AgentOSModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "zixun"
    }

    // 存储PageAgent实例的Map，以pageId为key
    private val pageAgents = mutableMapOf<String, PageAgent>()
    
    private val actionInstances = mutableMapOf<String, Action>()
    
    private val navigationCallbacks = mutableMapOf<String, Promise>()
    
    private val mMaxDistance = 1.5 // 最大识别距离，使用Double类型
    private var personList: List<Person>? = null
    
    private val DEFAULT_PERSON_LOST_TIMEOUT = 10L // 多久识别不到目标上报目标丢失状态，单位秒
    private val DEFAULT_PERSON_LOST_DISTANCE = 1.5f // 目标距离多远上报超距状态，单位米
    private val isAllowMoveBody = true // 是否允许机器人移动身体进行跟随
    
    private var isFaceFollowing = false
    

    
    private val mPersonListener = object : PersonListener() {
        override fun personChanged() {
            try {
                if (isFaceFollowing) {
                    return
                }
                
                personList = PersonApi.getInstance().getCompleteFaceList(mMaxDistance)
                val count = personList?.size ?: 0
                if(count > 0){
                    Log.d("zixun", "检测到人脸数量: $count")
                    personList?.forEachIndexed { index, person ->
                        Log.d("zixun",  "有人脸[$index] ")
                    }
                    // 发送事件到React Native
                    sendPersonDetectionEvent(count)
                    
                    // 获取最佳人脸并开始人脸跟随
                    val bestPerson = PersonUtils.getBestFace(personList, mMaxDistance, 60.0)
                    if (bestPerson != null) {
                        Log.d("zixun", "获取到最佳人脸，ID: ${bestPerson.id}, 距离: ${bestPerson.distance}")
                        // 发送最佳人脸检测事件到React Native
                        sendBestPersonDetectedEvent(bestPerson.id.toString(), bestPerson.distance.toDouble())
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "获取人脸列表失败", e)
            }
        }
    }

    override fun getName(): String {
        return "AgentOSModule"
    }
    
    init {
        // 在初始化时注册社保问答Action
        registerSocialInsuranceAction()
    }
    
    /**
     * 注册社保咨询Action
     */
    private fun registerSocialInsuranceAction() {
        try {
            val mainApplication = reactApplicationContext.applicationContext as MainApplication
            // 社保咨询Action已在MainApplication中注册，这里不需要重复注册
        } catch (e: Exception) {
            Log.e(TAG, "注册社保咨询Action失败", e)
        }
    }

    @ReactMethod
    fun query(text: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.query() called ===")
        Log.d(TAG, "Input text: '$text'")
        Log.d(TAG, "Text length: ${text.length}")
        
        try {
            Log.d(TAG, "Calling AgentCore.query() with text: '$text'")
            
            // 调用AgentOS SDK的query方法
            AgentCore.query(text)
            
            Log.d(TAG, "AgentCore.query() called successfully")
            
            // 返回成功结果
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "Query sent successfully")
            result.putString("queryText", text)
            
            Log.d(TAG, "Resolving promise with success result")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in query method", e)
            Log.e(TAG, "Exception type: ${e::class.java.simpleName}")
            Log.e(TAG, "Exception message: ${e.message}")
            
            // 返回错误结果
            promise.reject("QUERY_ERROR", "Failed to send query: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.query() finished ===")
    }

    /**
     * 发送人脸检测事件到React Native
     */
    private fun sendPersonDetectionEvent(count: Int) {
        val params = WritableNativeMap().apply {
            putInt("count", count)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onPersonDetected", params)
    }
    
    /**
     * 发送最佳人脸检测事件到React Native
     */
    private fun sendBestPersonDetectedEvent(personId: String, distance: Double) {
        val params = WritableNativeMap().apply {
            putString("personId", personId)
            putDouble("distance", distance)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onBestPersonDetected", params)
    }
    
    /**
     * 发送人脸跟踪状态更新事件到React Native
     */
    private fun sendFaceFollowingStatusUpdate(status: Int, data: String, personId: String?) {
        val params = WritableNativeMap().apply {
            putInt("status", status)
            putString("data", data)
            personId?.let { putString("personId", it) }
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onFaceFollowingStatusUpdate", params)
    }
    
    /**
     * 发送人脸跟踪错误事件到React Native
     */
    private fun sendFaceFollowingError(errorCode: Int, errorString: String, personId: String?) {
        val params = WritableNativeMap().apply {
            putInt("errorCode", errorCode)
            putString("errorString", errorString)
            personId?.let { putString("personId", it) }
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onFaceFollowingError", params)
    }
    
    /**
     * 发送人脸跟踪结果事件到React Native
     */
    private fun sendFaceFollowingResult(status: Int, responseString: String, personId: String?) {
        val params = WritableNativeMap().apply {
            putInt("status", status)
            putString("responseString", responseString)
            personId?.let { putString("personId", it) }
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onFaceFollowingResult", params)
    }
    

    
    /**
     * 开始人脸跟随
     */
    private fun startFaceFollowing(bestPerson: Person) {
        if (isFaceFollowing) {
            Log.d("zixun", "已经在进行人脸跟随，忽略此次请求")
            return
        }
        
        val personId = bestPerson.id
        Log.d("zixun", "开始人脸跟随，人脸ID: $personId")
        
        // 标记为正在进行人脸跟随，这会暂停人脸检测逻辑
        isFaceFollowing = true


        
        // 开始人脸跟随
        val reqId = 0 // 请求ID，可以是任意值
        RobotApi.getInstance().startFocusFollow(
            reqId, 
            personId, 
            DEFAULT_PERSON_LOST_TIMEOUT,
            DEFAULT_PERSON_LOST_DISTANCE, 
            isAllowMoveBody, 
            object : ActionListener() {
                override fun onStatusUpdate(status: Int, data: String) {
                    Log.d("zixun", "人脸跟随状态更新 - status: $status, data: $data")
                    
                    // 发送状态更新事件到RN层
                    sendFaceFollowingStatusUpdate(status, data, personId.toString())
                    
                    when (status) {
                        Definition.STATUS_TRACK_TARGET_SUCCEED -> {
                            // 跟随目标成功
                            Log.d("zixun", "人脸跟随目标成功")
                        }
                        Definition.STATUS_GUEST_LOST -> {
                            // 检测不到人脸 - 让RN层决定是否停止跟随
                            Log.d("zixun", "onStatusUpdate 检测不到人脸，等待RN层处理")
                        }
                        Definition.STATUS_GUEST_FARAWAY -> {
                            // 跟随目标距离已大于设置的最大距离
                            Log.d("zixun", "人脸跟随目标距离过远")
                        }
                        Definition.STATUS_GUEST_APPEAR -> {
                            // 跟随目标重新进入设置的最大距离内
                            Log.d(TAG, "人脸跟随目标重新进入范围")
                            
                            Log.d("zixun", "目标重新出现")
                        }
                    }
                }

                override fun onError(errorCode: Int, errorString: String) {
                    Log.e(TAG, "人脸跟随错误 - errorCode: $errorCode, errorString: $errorString")
                    
                    // 发送错误事件到RN层
                    sendFaceFollowingError(errorCode, errorString, personId.toString())
                    
                    when (errorCode) {
                        Definition.ERROR_SET_TRACK_FAILED, Definition.ERROR_TARGET_NOT_FOUND -> {
                            // 跟随目标未找到 - 让RN层决定是否停止跟随
                            Log.e(TAG, "人脸跟随目标未找到，等待RN层处理")
                        }
                        Definition.ACTION_RESPONSE_ALREADY_RUN -> {
                            // 正在跟随中，请先停止上次跟随，才能重新执行
                            Log.e(TAG, "已有人脸跟随正在进行")
                        }
                        Definition.ACTION_RESPONSE_REQUEST_RES_ERROR -> {
                            // 已经有需要控制底盘的接口调用(例如：引领、导航)，请先停止，才能继续调用
                            Log.e(TAG, "底盘资源被占用，无法进行人脸跟随，等待RN层处理")
                        }
                    }
                }

                override fun onResult(status: Int, responseString: String) {
                    Log.d(TAG, "人脸跟随结果 - status: $status, responseString: $responseString")
                    
                    // 发送结果事件到RN层
                    sendFaceFollowingResult(status, responseString, personId.toString())
                    
                    if (status == Definition.ACTION_RESPONSE_STOP_SUCCESS) {
                        // 在焦点跟随过程中，主动调用stopFocusFollow，成功停止跟随
                        Log.d(TAG, "人脸跟随已成功停止")
                        // 移除自动调用stopFaceFollowing()，让RN层控制
                    }
                }
            }
        )
        
        // 发送人脸跟随状态变更事件到React Native
        sendFaceFollowingStatusEvent(true, personId.toString())
    }
    
    /**
     * 停止人脸跟随
     */
    private fun stopFaceFollowing() {
        if (!isFaceFollowing) {
            return
        }
        
        Log.d(TAG, "停止人脸跟随")
        
        // 停止人脸跟随
        val reqId = 0 // 请求ID，可以是任意值
        RobotApi.getInstance().stopFocusFollow(reqId)
        
        // 重置状态
        isFaceFollowing = false
        
        // 发送人脸跟随状态变更事件到React Native
        sendFaceFollowingStatusEvent(false, null)
    }
    
    /**
     * 发送人脸跟随状态事件到React Native
     */
    private fun sendFaceFollowingStatusEvent(isFollowing: Boolean, personId: String?) {
        val params = WritableNativeMap().apply {
            putBoolean("isFollowing", isFollowing)
            personId?.let { putString("personId", it) }
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onFaceFollowingStatusChanged", params)
    }
    
    /**
     * 注册人脸识别监听器
     */
    @ReactMethod
    fun registerPersonListener(promise: Promise) {
        try {
            Log.d(TAG, "正在注册人脸识别监听器...")
            val result = PersonApi.getInstance().registerPersonListener(mPersonListener)
            if (result == true) {
                Log.d(TAG, "人脸识别监听器注册成功")
                val response = WritableNativeMap().apply {
                    putBoolean("success", true)
                    putString("message", "人脸识别监听器注册成功")
                }
                promise.resolve(response)
            } else {
                Log.e(TAG, "人脸识别监听器注册失败，错误码: $result")
                promise.reject("REGISTER_ERROR", "人脸识别监听器注册失败，错误码: $result")
            }
        } catch (e: Exception) {
            Log.e(TAG, "注册人脸识别监听器时发生异常", e)
            promise.reject("REGISTER_EXCEPTION", "注册人脸识别监听器时发生异常: ${e.message}", e)
        }
    }
    
    /**
     * 注销人脸识别监听器
     */
    @ReactMethod
    fun unregisterPersonListener(promise: Promise) {
        try {
            Log.d(TAG, "正在注销人脸识别监听器...")
            val result = PersonApi.getInstance().unregisterPersonListener(mPersonListener)
            Log.d(TAG, "人脸识别监听器注销${result}")
            
            val response = WritableNativeMap().apply {
                putString("message", "人脸识别监听器注销${ result}")
            }
            promise.resolve(response)
        } catch (e: Exception) {
            Log.e(TAG, "注销人脸识别监听器时发生异常", e)
            promise.reject("UNREGISTER_EXCEPTION", "注销人脸识别监听器时发生异常: ${e.message}", e)
        }
    }
    
    /**
     * RN层调用生成新的SessionId
     */
    @ReactMethod
    fun generateNewSessionId(promise: Promise) {
        try {
            val mainApplication = reactApplicationContext.applicationContext as MainApplication
            val newSessionId = mainApplication.generateNewSessionId()
            Log.d(TAG, "RN层请求生成新的sessionId: $newSessionId")
            
            val response = WritableNativeMap().apply {
                putBoolean("success", true)
                putString("message", "SessionId已生成")
                putString("sessionId", newSessionId)
            }
            promise.resolve(response)
        } catch (e: Exception) {
            Log.e(TAG, "生成SessionId时发生异常", e)
            promise.reject("GENERATE_SESSION_ID_EXCEPTION", "生成SessionId时发生异常: ${e.message}", e)
        }
    }
    
    /**
     * RN层调用开始人脸跟随
     */
    @ReactMethod
    fun startFaceFollowingByPersonId(personId: String, promise: Promise) {
        try {
            if (isFaceFollowing) {
                val response = WritableNativeMap().apply {
                    putBoolean("success", false)
                    putString("message", "已经在进行人脸跟随")
                }
                promise.resolve(response)
                return
            }
            
            // 从当前人脸列表中找到指定ID的人脸
            val targetPerson = personList?.find { it.id.toString() == personId }
            if (targetPerson == null) {
                val response = WritableNativeMap().apply {
                    putBoolean("success", false)
                    putString("message", "未找到指定ID的人脸: $personId")
                }
                promise.resolve(response)
                return
            }
            
            Log.d(TAG, "RN层请求开始人脸跟随，人脸ID: $personId")
            startFaceFollowing(targetPerson)
            
            val response = WritableNativeMap().apply {
                putBoolean("success", true)
                putString("message", "人脸跟随已开始")
                putString("personId", personId)
            }
            promise.resolve(response)
        } catch (e: Exception) {
            Log.e(TAG, "开始人脸跟随时发生异常", e)
            promise.reject("START_FACE_FOLLOWING_EXCEPTION", "开始人脸跟随时发生异常: ${e.message}", e)
        }
    }
    
    /**
     * 手动停止人脸跟随
     */
    @ReactMethod
    fun stopFaceFollowing(promise: Promise) {
        try {
            if (!isFaceFollowing) {
                val response = WritableNativeMap().apply {
                    putBoolean("success", true)
                    putString("message", "当前没有进行人脸跟随")
                }
                promise.resolve(response)
                return
            }
            
            Log.d(TAG, "手动停止人脸跟随")
            
            stopFaceFollowing()
            
            val response = WritableNativeMap().apply {
                putBoolean("success", true)
                putString("message", "人脸跟随已停止")
            }
            promise.resolve(response)
        } catch (e: Exception) {
            Log.e(TAG, "停止人脸跟随时发生异常", e)
            promise.reject("STOP_FACE_FOLLOWING_EXCEPTION", "停止人脸跟随时发生异常: ${e.message}", e)
        }
    }
    
    @ReactMethod
    fun uploadInterfaceInfo(interfaceInfo: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.uploadInterfaceInfo() called ===")
        Log.d(TAG, "Interface info length: ${interfaceInfo.length}")
        Log.d(TAG, "Interface info: '$interfaceInfo'")
        
        try {
            Log.d(TAG, "Calling AgentCore.uploadInterfaceInfo()")
            
            // 调用AgentOS SDK的uploadInterfaceInfo方法
            AgentCore.uploadInterfaceInfo(interfaceInfo)
            
            Log.d(TAG, "AgentCore.uploadInterfaceInfo() called successfully")
            
            // 返回成功结果
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "Interface info uploaded successfully")
            
            Log.d(TAG, "Resolving promise with success result")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in uploadInterfaceInfo method", e)
            Log.e(TAG, "Exception type: ${e::class.java.simpleName}")
            Log.e(TAG, "Exception message: ${e.message}")
            
            // 返回错误结果
            promise.reject("UPLOAD_ERROR", "Failed to upload interface info: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.uploadInterfaceInfo() finished ===")
    }

    @ReactMethod
    fun clearContext(promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.clearContext() called ===")
        
        try {
            Log.d(TAG, "Calling AgentCore.clearContext()")
            
            // 清空大模型对话上下文
            AgentCore.clearContext()
            
            Log.d(TAG, "AgentCore.clearContext() called successfully")
            
            // 返回成功结果
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "Context cleared successfully")
            
            Log.d(TAG, "Resolving promise with success result")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in clearContext method", e)
            Log.e(TAG, "Exception type: ${e::class.java.simpleName}")
            Log.e(TAG, "Exception message: ${e.message}")
            
            // 返回错误结果
            promise.reject("CLEAR_ERROR", "Failed to clear context: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.clearContext() finished ===")
    }

    // =============== PageAgent 相关方法 ===============

    @ReactMethod
    fun createPageAgent(pageId: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.createPageAgent() called ===")
        Log.d(TAG, "PageId: '$pageId'")
        
        try {
            // 检查是否已存在同名的PageAgent
            if (pageAgents.containsKey(pageId)) {
                Log.w(TAG, "PageAgent with id '$pageId' already exists, removing old one")
                pageAgents.remove(pageId)
            }
            
            // 创建新的PageAgent
            val pageAgent = PageAgent(pageId)
            pageAgents[pageId] = pageAgent
            
            Log.d(TAG, "PageAgent created successfully with id: '$pageId'")
            
            // 返回成功结果
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "PageAgent created successfully")
            result.putString("pageId", pageId)
            
            Log.d(TAG, "Resolving promise with success result")
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in createPageAgent method", e)
            Log.e(TAG, "Exception type: ${e::class.java.simpleName}")
            Log.e(TAG, "Exception message: ${e.message}")
            
            // 返回错误结果
            promise.reject("CREATE_PAGEAGENT_ERROR", "Failed to create PageAgent: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.createPageAgent() finished ===")
    }

    @ReactMethod
    fun setPersona(pageId: String, persona: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.setPersona() called ===")
        Log.d(TAG, "PageId: '$pageId', Persona: '$persona'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                pageAgent.setPersona(persona)
                Log.d(TAG, "Persona set successfully for PageAgent: '$pageId'")
                
                // 返回成功结果
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "Persona set successfully")
                result.putString("pageId", pageId)
                
                promise.resolve(result)
            } else {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in setPersona method", e)
            promise.reject("SET_PERSONA_ERROR", "Failed to set persona: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.setPersona() finished ===")
    }

    @ReactMethod
    fun setObjective(pageId: String, objective: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.setObjective() called ===")
        Log.d(TAG, "PageId: '$pageId', Objective: '$objective'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                pageAgent.setObjective(objective)
                Log.d(TAG, "Objective set successfully for PageAgent: '$pageId'")
                
                // 返回成功结果
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "Objective set successfully")
                result.putString("pageId", pageId)
                
                promise.resolve(result)
            } else {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in setObjective method", e)
            promise.reject("SET_OBJECTIVE_ERROR", "Failed to set objective: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.setObjective() finished ===")
    }

    @ReactMethod
    fun registerAction(pageId: String, actionName: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.registerAction() called ===")
        Log.d(TAG, "PageId: '$pageId', ActionName: '$actionName'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                pageAgent.registerAction(actionName)
                Log.d(TAG, "Action '$actionName' registered successfully for PageAgent: '$pageId'")
                
                // 返回成功结果
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "Action registered successfully")
                result.putString("pageId", pageId)
                result.putString("actionName", actionName)
                
                promise.resolve(result)
            } else {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in registerAction method", e)
            promise.reject("REGISTER_ACTION_ERROR", "Failed to register action: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.registerAction() finished ===")
    }

    @ReactMethod
    fun beginPageAgent(pageId: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.beginPageAgent() called ===")
        Log.d(TAG, "PageId: '$pageId'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                pageAgent.begin()
                Log.d(TAG, "PageAgent '$pageId' began successfully")
                
                // 返回成功结果
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "PageAgent began successfully")
                result.putString("pageId", pageId)
                
                promise.resolve(result)
            } else {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in beginPageAgent method", e)
            promise.reject("BEGIN_PAGEAGENT_ERROR", "Failed to begin PageAgent: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.beginPageAgent() finished ===")
    }

    @ReactMethod
    fun endPageAgent(pageId: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.endPageAgent() called ===")
        Log.d(TAG, "PageId: '$pageId'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                pageAgent.end()
                Log.d(TAG, "PageAgent '$pageId' ended successfully")
                
                // 从Map中移除
                pageAgents.remove(pageId)
                Log.d(TAG, "PageAgent '$pageId' removed from cache")
                
                // 返回成功结果
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "PageAgent ended successfully")
                result.putString("pageId", pageId)
                
                promise.resolve(result)
            } else {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in endPageAgent method", e)
            promise.reject("END_PAGEAGENT_ERROR", "Failed to end PageAgent: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.endPageAgent() finished ===")
    }

    @ReactMethod
    fun getPageAgentInfo(pageId: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.getPageAgentInfo() called ===")
        Log.d(TAG, "PageId: '$pageId'")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent != null) {
                // 返回PageAgent信息
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "PageAgent found")
                result.putString("pageId", pageId)
                result.putBoolean("exists", true)
                
                promise.resolve(result)
            } else {
                // PageAgent不存在
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "PageAgent not found")
                result.putString("pageId", pageId)
                result.putBoolean("exists", false)
                
                promise.resolve(result)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in getPageAgentInfo method", e)
            promise.reject("GET_PAGEAGENT_INFO_ERROR", "Failed to get PageAgent info: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.getPageAgentInfo() finished ===")
    }

    // =============== 复杂Action注册方法 ===============

    @ReactMethod
    fun registerComplexAction(pageId: String, actionConfig: ReadableMap, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.registerComplexAction() called ===")
        Log.d(TAG, "PageId: '$pageId'")
        Log.d(TAG, "ActionConfig: $actionConfig")
        
        try {
            val pageAgent = pageAgents[pageId]
            if (pageAgent == null) {
                Log.e(TAG, "PageAgent not found for id: '$pageId'")
                promise.reject("PAGEAGENT_NOT_FOUND", "PageAgent not found for id: $pageId")
                return
            }
            
            // 解析Action配置
            val actionName = actionConfig.getString("name") ?: throw IllegalArgumentException("Action name is required")
            val displayName = actionConfig.getString("displayName") ?: throw IllegalArgumentException("Action displayName is required")
            val desc = actionConfig.getString("desc") ?: throw IllegalArgumentException("Action desc is required")
            val appId = AgentCore.appId // 获取当前应用的appId
            
            Log.d(TAG, "Parsed action - name: '$actionName', displayName: '$displayName', desc: '$desc', appId: '$appId'")
            
            // 解析Parameters
            val parameters = mutableListOf<Parameter>()
            if (actionConfig.hasKey("parameters")) {
                val parametersArray = actionConfig.getArray("parameters")
                if (parametersArray != null) {
                    for (i in 0 until parametersArray.size()) {
                        val paramMap = parametersArray.getMap(i)
                        if (paramMap != null) {
                            val paramName = paramMap.getString("name") ?: throw IllegalArgumentException("Parameter name is required")
                            val paramType = paramMap.getString("type") ?: "STRING"
                            val paramDesc = paramMap.getString("desc") ?: ""
                            val paramRequired = if (paramMap.hasKey("required")) paramMap.getBoolean("required") else false
                            
                            // 转换参数类型
                            val parameterType = when (paramType.uppercase()) {
                                "STRING" -> ParameterType.STRING
                                "ENUM" -> ParameterType.ENUM
                                else -> ParameterType.STRING
                            }
                            
                            // 处理枚举值
                            var enumValues: List<String>? = null
                            if (parameterType == ParameterType.ENUM && paramMap.hasKey("enumValues")) {
                                val enumArray = paramMap.getArray("enumValues")
                                if (enumArray != null) {
                                    enumValues = mutableListOf()
                                    for (j in 0 until enumArray.size()) {
                                        enumArray.getString(j)?.let { enumValues.add(it) }
                                    }
                                }
                            }
                            
                            val parameter = Parameter(paramName, parameterType, paramDesc, paramRequired, enumValues)
                            parameters.add(parameter)
                            
                            Log.d(TAG, "Added parameter: $paramName ($parameterType) - $paramDesc, required: $paramRequired")
                        }
                    }
                }
            }
            
            Log.d(TAG, "Total parameters count: ${parameters.size}")
            
            // 创建ActionExecutor
            val executor = object : ActionExecutor {
                override fun onExecute(action: Action, params: Bundle?): Boolean {
                    Log.d(TAG, "=== ActionExecutor.onExecute() called ===")
                    Log.d(TAG, "Action: ${action.name}, sid: ${action.sid}")
                    Log.d(TAG, "Params: $params")
                    
                    try {
                        // 存储Action实例，用于后续notify调用
                        actionInstances[action.sid] = action
                        
                        // 立即启动异步处理，不等待结果
                        AOCoroutineScope.launch {
                            try {
                                Log.d(TAG, "=== handleActionExecutionAsync called ===")
                                // 发送事件到React Native进行异步处理
                                currentActivity?.runOnUiThread {
                                    handleActionExecution(action, params)
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Error in async action handling", e)
                                // 如果处理失败，自动notify失败
                                try {
                                    action.notify(ActionResult(ActionStatus.FAILED))
                                } catch (notifyError: Exception) {
                                    Log.e(TAG, "Error notifying action failure", notifyError)
                                }
                            }
                        }
                        
                        // 立即返回true，表示我们要处理这个Action
                        return true
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "Error in ActionExecutor.onExecute", e)
                        actionInstances.remove(action.sid)
                        return false
                    }
                }
            }
            
            // 创建Action对象
            val action = Action(
                name = actionName,
                appId = appId,
                displayName = displayName,
                desc = desc,
                parameters = parameters,
                executor = executor
            )
            
            // 注册Action到PageAgent
            pageAgent.registerAction(action)



            
            
            Log.d(TAG, "Complex action '$actionName' registered successfully for PageAgent: '$pageId'")
            
            // 返回成功结果
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "Complex action registered successfully")
            result.putString("pageId", pageId)
            result.putString("actionName", actionName)
            result.putString("displayName", displayName)
            result.putString("desc", desc)
            result.putInt("parametersCount", parameters.size)
            
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in registerComplexAction method", e)
            promise.reject("REGISTER_COMPLEX_ACTION_ERROR", "Failed to register complex action: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.registerComplexAction() finished ===")
    }

    // =============== Action执行处理方法 ===============
    
    private fun handleActionExecution(action: Action, params: Bundle?) {
        Log.d(TAG, "=== handleActionExecution() called ===")
        Log.d(TAG, "Action name: ${action.name}")
        Log.d(TAG, "Action displayName: ${action.displayName}")
        Log.d(TAG, "Action sid: ${action.sid}")
        Log.d(TAG, "User query: ${action.userQuery}")
        
        try {
            // 构建回调数据
            val actionData = WritableNativeMap()
            actionData.putString("actionName", action.name)
            actionData.putString("displayName", action.displayName)
            actionData.putString("desc", action.desc)
            actionData.putString("sid", action.sid)
            actionData.putString("userQuery", action.userQuery)
            
            // 解析参数
            val parametersData = WritableNativeMap()
            if (params != null) {
                for (key in params.keySet()) {
                    val value = params[key]
                    when (value) {
                        is String -> parametersData.putString(key, value)
                        is Int -> parametersData.putInt(key, value)
                        is Double -> parametersData.putDouble(key, value)
                        is Boolean -> parametersData.putBoolean(key, value)
                        else -> parametersData.putString(key, value?.toString() ?: "")
                    }
                    Log.d(TAG, "Parameter: $key = $value")
                }
            }
            actionData.putMap("parameters", parametersData)
            
            // 发送事件到React Native，等待React Native返回处理结果
            reactApplicationContext
                .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("AgentActionExecuted", actionData)
            
            Log.d(TAG, "Action execution data sent to React Native, waiting for response...")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in handleActionExecution", e)
            // 出错时调用notify告知失败，然后清理Action实例
            val actionInstance = actionInstances.remove(action.sid)
            actionInstance?.notify(ActionResult(ActionStatus.FAILED))
        }
        
        Log.d(TAG, "=== handleActionExecution() finished ===")
    }

    // =============== Action执行结果回调方法（已弃用，保留兼容性）===============
    
    @ReactMethod
    fun respondToActionExecution(actionSid: String, success: Boolean, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.respondToActionExecution() called ===")
        Log.d(TAG, "ActionSid: '$actionSid', Success: $success")
        Log.w(TAG, "respondToActionExecution is deprecated, please use notifyActionComplete directly")
        
        try {
            // 在简化的流程中，这个方法不再需要，直接返回成功状态
            val result = WritableNativeMap()
            result.putString("status", "success")
            result.putString("message", "respondToActionExecution called but deprecated")
            result.putString("actionSid", actionSid)
            result.putBoolean("success", success)
            promise.resolve(result)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in respondToActionExecution method", e)
            promise.reject("RESPOND_ACTION_ERROR", "Failed to respond to action execution: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.respondToActionExecution() finished ===")
    }

    // =============== Action.notify()调用方法 ===============
    
    @ReactMethod
    fun notifyActionComplete(actionSid: String, success: Boolean, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.notifyActionComplete() called ===")
        Log.d(TAG, "ActionSid: '$actionSid', Success: $success")
        
        try {
            // 找到对应的Action对象
            val action = actionInstances.remove(actionSid) // 直接remove，用完即删
            
            if (action != null) {
                Log.d(TAG, "Found action for actionSid: $actionSid, calling notify()")
                
                // 根据业务执行结果调用action.notify()
                if (success) {
                    Log.d(TAG, "Calling action.notify() with SUCCESS status")
                    action.notify(ActionResult(ActionStatus.SUCCEEDED))
                } else {
                    Log.d(TAG, "Calling action.notify() with FAILED status")
                    action.notify(ActionResult(ActionStatus.FAILED))
                }
                
                Log.d(TAG, "Action instance cleaned up for actionSid: $actionSid")
                
                // 返回成功响应
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "action.notify() called successfully")
                result.putString("actionSid", actionSid)
                result.putBoolean("success", success)
                promise.resolve(result)
            } else {
                Log.w(TAG, "No action found for actionSid: $actionSid")
                promise.reject("ACTION_NOT_FOUND", "No action found for sid: $actionSid")
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in notifyActionComplete method", e)
            promise.reject("NOTIFY_ACTION_ERROR", "Failed to notify action completion: ${e.message}", e)
        }
        
        Log.d(TAG, "=== AgentOSModule.notifyActionComplete() finished ===")
    }

    /**
     * 检查机器人是否已定位
     * @param promise React Native的Promise对象，用于返回结果
     */
    @ReactMethod
    fun checkRobotLocalization(promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.checkRobotLocalization() called ===")
        
        try {
            val reqId = 0
            val callResult = RobotApi.getInstance().isRobotEstimate(reqId, object : CommandListener() {
                override fun onResult(result: Int, message: String) {
                    Log.d(TAG, "Robot localization check result: $result, message: $message")
                    
                    val response = WritableNativeMap()
                    response.putString("status", "success")
                    response.putInt("result", result)
                    response.putString("message", message)
                    
                    if ("true" == message) {
                        Log.d(TAG, "当前已定位")
                        response.putBoolean("isLocalized", true)
                        response.putString("description", "机器人当前已定位")
                    } else {
                        Log.d(TAG, "当前未定位")
                        response.putBoolean("isLocalized", false)
                        response.putString("description", "机器人当前未定位")
                    }
                    
                    promise.resolve(response)
                }
            })
            
            // 检查RobotApi调用是否立即失败
            Log.d(TAG, "RobotApi.isRobotEstimate call result: $callResult")
            if (callResult != 0) {
                // 如果返回值不是0，说明调用失败，立即返回错误
                Log.w(TAG, "RobotApi.isRobotEstimate call failed with code: $callResult")
                val errorResponse = WritableNativeMap()
                errorResponse.putString("status", "error")
                errorResponse.putString("message", "Robot API call failed")
                errorResponse.putBoolean("isLocalized", false)
                errorResponse.putString("description", "机器人连接异常，无法检查定位状态")
                errorResponse.putInt("errorCode", callResult)
                promise.resolve(errorResponse)
                return
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in checkRobotLocalization method", e)
            val errorResponse = WritableNativeMap()
            errorResponse.putString("status", "error")
            errorResponse.putString("message", "Failed to check robot localization: ${e.message}")
            errorResponse.putBoolean("isLocalized", false)
            errorResponse.putString("description", "检查定位状态时发生错误")
            promise.resolve(errorResponse)
        }
        
        Log.d(TAG, "=== AgentOSModule.checkRobotLocalization() finished ===")
    }

    /**
     * 启动机器人定位（重定位）
     * @param promise React Native的Promise对象，用于返回结果
     */
    @ReactMethod
    fun startRobotReposition(promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.startRobotReposition() called ===")
        
        try {
            val visionIntent = Intent()
            visionIntent.setAction(Definition.ACTION_REPOSITION)
            visionIntent.putExtra(Definition.REPOSITION_VISION, true)
            
            // 获取当前的ReactContext来发送广播
            val context = reactApplicationContext
            context.sendBroadcast(visionIntent)
            
            Log.d(TAG, "Reposition broadcast sent successfully")
            
            val response = WritableNativeMap()
            response.putString("status", "success")
            response.putString("message", "机器人定位启动成功")
            response.putString("description", "已发送重定位广播指令")
            
            promise.resolve(response)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in startRobotReposition method", e)
            val errorResponse = WritableNativeMap()
            errorResponse.putString("status", "error")
            errorResponse.putString("message", "Failed to start robot reposition: ${e.message}")
            errorResponse.putString("description", "启动机器人定位时发生错误")
            promise.resolve(errorResponse)
        }
        
        Log.d(TAG, "=== AgentOSModule.startRobotReposition() finished ===")
    }

    /**
     * 获取地图点位列表
     * @param promise React Native的Promise对象，用于返回结果
     */
    @ReactMethod
    fun getPlaceList(promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.getPlaceList() called ===")
        
        try {
            val reqId = 0
            val callResult = RobotApi.getInstance().getPlaceList(reqId, object : CommandListener() {
                override fun onResult(result: Int, message: String) {
                    Log.d(TAG, "Place list result: $result, message: $message")
                    
                    try {
                        val placeList = mutableListOf<String>()
                        val placeDetails = WritableNativeArray()
                        
                        val jsonArray = JSONArray(message)
                        val length = jsonArray.length()
                        
                        for (i in 0 until length) {
                            val json = jsonArray.getJSONObject(i)
                            val x = json.getDouble("x") // x坐标
                            val y = json.getDouble("y") // y坐标
                            val theta = json.getDouble("theta") // 面朝方向
                            val name = json.getString("name") // 位置名称
                            
                            Log.i(TAG, "位置名称: $name, x坐标: $x, y坐标: $y, 面朝方向: $theta")
                            
                            // 过滤掉回充点和充电桩
                            if (!name.contains("回充点") && !name.contains("充电桩")) {
                                placeList.add(name)
                                
                                // 创建详细信息对象
                                val placeDetail = WritableNativeMap()
                                placeDetail.putString("name", name)
                                placeDetail.putDouble("x", x)
                                placeDetail.putDouble("y", y)
                                placeDetail.putDouble("theta", theta)
                                placeDetails.pushMap(placeDetail)
                            }
                        }
                        
                        Log.i(TAG, "过滤后的地点列表: $placeList")
                        
                        val response = WritableNativeMap()
                        response.putString("status", "success")
                        response.putString("message", "获取点位列表成功")
                        response.putInt("result", result)
                        response.putInt("totalCount", length)
                        response.putInt("filteredCount", placeList.size)
                        
                        // 添加点位名称列表
                        val placeNameArray = WritableNativeArray()
                        for (placeName in placeList) {
                            placeNameArray.pushString(placeName)
                        }
                        response.putArray("placeNames", placeNameArray)
                        
                        // 添加详细信息列表
                        response.putArray("placeDetails", placeDetails)
                        
                        promise.resolve(response)
                        
                    } catch (e: JSONException) {
                        Log.e(TAG, "JSON parsing error in getPlaceList", e)
                        val errorResponse = WritableNativeMap()
                        errorResponse.putString("status", "error")
                        errorResponse.putString("message", "解析点位数据时发生JSON错误: ${e.message}")
                        errorResponse.putArray("placeNames", WritableNativeArray())
                        errorResponse.putArray("placeDetails", WritableNativeArray())
                        promise.resolve(errorResponse)
                    } catch (e: NullPointerException) {
                        Log.e(TAG, "Null pointer error in getPlaceList", e)
                        val errorResponse = WritableNativeMap()
                        errorResponse.putString("status", "error")
                        errorResponse.putString("message", "获取点位数据时发生空指针错误: ${e.message}")
                        errorResponse.putArray("placeNames", WritableNativeArray())
                        errorResponse.putArray("placeDetails", WritableNativeArray())
                        promise.resolve(errorResponse)
                    }
                }
            })
            
            // 检查RobotApi调用是否立即失败
            Log.d(TAG, "RobotApi.getPlaceList call result: $callResult")
            if (callResult != 0) {
                // 如果返回值不是0，说明调用失败，立即返回错误
                Log.w(TAG, "RobotApi.getPlaceList call failed with code: $callResult")
                val errorResponse = WritableNativeMap()
                errorResponse.putString("status", "error")
                errorResponse.putString("message", "Robot API call failed")
                errorResponse.putArray("placeNames", WritableNativeArray())
                errorResponse.putArray("placeDetails", WritableNativeArray())
                errorResponse.putInt("errorCode", callResult)
                promise.resolve(errorResponse)
                return
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in getPlaceList method", e)
            val errorResponse = WritableNativeMap()
            errorResponse.putString("status", "error")
            errorResponse.putString("message", "Failed to get place list: ${e.message}")
            errorResponse.putArray("placeNames", WritableNativeArray())
            errorResponse.putArray("placeDetails", WritableNativeArray())
            promise.resolve(errorResponse)
        }
        
        Log.d(TAG, "=== AgentOSModule.getPlaceList() finished ===")
    }

    /**
     * 开始导航到指定地点
     * @param destName 目标地点名称
     * @param promise React Native的Promise对象，用于返回结果
     */
    @ReactMethod
    fun startNavigation(destName: String, promise: Promise) {
        Log.d("zixun", "=== AgentOSModule.startNavigation() called ===")
        Log.d("zixun", "Navigation destination: $destName")
        
        try {
            val reqId = 0
            val coordinateDeviation = 0.2 // 坐标偏差
            val timeout = 30000L // 超时时间30秒
            
            // 移除自动停止人脸跟踪，让RN层控制
            // stopFaceFollowing();

            // 移除自动注销人脸识别监听器，让RN层控制
            // try {
            //     val result = PersonApi.getInstance().unregisterPersonListener(mPersonListener)
            //     Log.d(TAG, "导航开始前注销人脸识别监听器: $result")
            // } catch (e: Exception) {
            //     Log.e(TAG, "导航开始前注销人脸识别监听器失败", e)
            // }

            val callResult = RobotApi.getInstance().startNavigation(reqId, destName, coordinateDeviation, timeout, object : ActionListener() {
                override fun onResult(status: Int, response: String) {
                    Log.d(TAG, "Navigation result - status: $status, response: $response")
                    
                    when (status) {
                        Definition.RESULT_OK -> {
                            if ("true" == response) {
                                Log.i("zixun", "导航成功")
                                
                                // 移除自动重新注册人脸识别监听器，让RN层控制
                                // try {
                                //     val result = PersonApi.getInstance().registerPersonListener(mPersonListener)
                                //     Log.d(TAG, "导航成功后重新注册人脸识别监听器: $result")
                                // } catch (e: Exception) {
                                //     Log.e(TAG, "导航成功后重新注册人脸识别监听器失败", e)
                                // }
                                
                                // 创建事件用的Map对象
                                val eventResponse = WritableNativeMap()
                                eventResponse.putString("status", "success")
                                eventResponse.putString("message", "导航完成成功")
                                eventResponse.putString("destination", destName)
                                eventResponse.putBoolean("navigationCompleted", true)
                                eventResponse.putString("description", "机器人已成功到达目标地点")
                                
                                // 创建Promise用的Map对象
                                val promiseResponse = WritableNativeMap()
                                promiseResponse.putString("status", "success")
                                promiseResponse.putString("message", "导航完成成功")
                                promiseResponse.putString("destination", destName)
                                promiseResponse.putBoolean("navigationCompleted", true)
                                promiseResponse.putString("description", "机器人已成功到达目标地点")
                                
                                // 发送导航成功事件到React Native
                                sendNavigationEvent("NavigationSuccess", eventResponse)
                                promise.resolve(promiseResponse)
                            } else {
                                Log.i(TAG, "导航失败")
                                
                                // 移除自动重新注册人脸识别监听器，让RN层控制
                                // try {
                                //     val result = PersonApi.getInstance().registerPersonListener(mPersonListener)
                                //     Log.d(TAG, "导航失败后重新注册人脸识别监听器: $result")
                                // } catch (e: Exception) {
                                //     Log.e(TAG, "导航失败后重新注册人脸识别监听器失败", e)
                                // }
                                
                                // 创建事件用的Map对象
                                val eventResponse = WritableNativeMap()
                                eventResponse.putString("status", "failure")
                                eventResponse.putString("message", "导航启动失败")
                                eventResponse.putString("destination", destName)
                                eventResponse.putBoolean("navigationStarted", false)
                                eventResponse.putString("description", "机器人导航启动失败")
                                
                                // 创建Promise用的Map对象
                                val promiseResponse = WritableNativeMap()
                                promiseResponse.putString("status", "failure")
                                promiseResponse.putString("message", "导航启动失败")
                                promiseResponse.putString("destination", destName)
                                promiseResponse.putBoolean("navigationStarted", false)
                                promiseResponse.putString("description", "机器人导航启动失败")
                                
                                sendNavigationEvent("NavigationFailure", eventResponse)
                                promise.resolve(promiseResponse)
                            }
                        }
                        else -> {
                            // 移除自动重新注册人脸识别监听器，让RN层控制
                            // try {
                            //     val result = PersonApi.getInstance().registerPersonListener(mPersonListener)
                            //     Log.d(TAG, "导航错误后重新注册人脸识别监听器: $result")
                            // } catch (e: Exception) {
                            //     Log.e(TAG, "导航错误后重新注册人脸识别监听器失败", e)
                            // }
                            
                            // 创建事件用的Map对象
                            val eventResponse = WritableNativeMap()
                            eventResponse.putString("status", "error")
                            eventResponse.putString("message", "导航过程中发生未知错误")
                            eventResponse.putString("destination", destName)
                            eventResponse.putBoolean("navigationStarted", false)
                            eventResponse.putInt("errorStatus", status)
                            
                            // 创建Promise用的Map对象
                            val promiseResponse = WritableNativeMap()
                            promiseResponse.putString("status", "error")
                            promiseResponse.putString("message", "导航过程中发生未知错误")
                            promiseResponse.putString("destination", destName)
                            promiseResponse.putBoolean("navigationStarted", false)
                            promiseResponse.putInt("errorStatus", status)
                            
                            sendNavigationEvent("NavigationError", eventResponse)
                            promise.resolve(promiseResponse)
                        }
                    }
                }

                override fun onError(errorCode: Int, errorString: String?) {
                    Log.e(TAG, "Navigation error - code: $errorCode, message: ${errorString ?: "null"}")
                    
                    // 创建事件用的Map对象
                    val eventResponse = WritableNativeMap()
                    eventResponse.putString("status", "error")
                    eventResponse.putInt("errorCode", errorCode)
                    eventResponse.putString("errorString", errorString ?: "Unknown error")
                    eventResponse.putString("destination", destName)
                    eventResponse.putBoolean("navigationStarted", false)
                    
                    // 创建Promise用的Map对象
                    val promiseResponse = WritableNativeMap()
                    promiseResponse.putString("status", "error")
                    promiseResponse.putInt("errorCode", errorCode)
                    promiseResponse.putString("errorString", errorString ?: "Unknown error")
                    promiseResponse.putString("destination", destName)
                    promiseResponse.putBoolean("navigationStarted", false)
                    
                    when (errorCode) {
                        Definition.ERROR_NOT_ESTIMATE -> {
                            Log.i(TAG, "当前未定位")
                            val message = "导航失败：机器人当前未定位"
                            val description = "请先进行机器人定位后再尝试导航"
                            val errorType = "NOT_LOCALIZED"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        Definition.ERROR_IN_DESTINATION -> {
                            Log.i(TAG, "当前机器人已经在目的地范围内")
                            val message = "导航完成：机器人已在目标地点"
                            val description = "机器人当前已经在目的地范围内"
                            val errorType = "ALREADY_AT_DESTINATION"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        Definition.ERROR_DESTINATION_NOT_EXIST -> {
                            Log.i(TAG, "导航目的地不存在")
                            val message = "导航失败：目标地点不存在"
                            val description = "指定的目标地点在地图中不存在"
                            val errorType = "DESTINATION_NOT_EXIST"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        Definition.ERROR_DESTINATION_CAN_NOT_ARRAIVE -> {
                            Log.i(TAG, "避障超时，目的地不能到达")
                            val message = "导航失败：目标地点无法到达"
                            val description = "避障超时，目的地不能到达"
                            val errorType = "CANNOT_ARRIVE"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        Definition.ACTION_RESPONSE_ALREADY_RUN -> {
                            Log.i(TAG, "当前接口已经调用，请先停止，才能再次调用")
                            val message = "导航失败：导航任务已在进行中"
                            val description = "请先停止当前导航任务再开始新的导航"
                            val errorType = "ALREADY_RUNNING"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        Definition.ACTION_RESPONSE_REQUEST_RES_ERROR -> {
                            Log.i(TAG, "已经有需要控制底盘的接口调用，请先停止，才能继续调用")
                            val message = "导航失败：底盘控制冲突"
                            val description = "已有其他接口控制底盘，请先停止后再导航"
                            val errorType = "RESOURCE_CONFLICT"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                        else -> {
                            val message = "导航失败：${errorString ?: "未知错误"}"
                            val description = "导航过程中发生错误：${errorString ?: "未知错误"}"
                            val errorType = "UNKNOWN_ERROR"
                            
                            eventResponse.putString("message", message)
                            eventResponse.putString("description", description)
                            eventResponse.putString("errorType", errorType)
                            promiseResponse.putString("message", message)
                            promiseResponse.putString("description", description)
                            promiseResponse.putString("errorType", errorType)
                        }
                    }
                    
                    // 发送事件和resolve Promise使用不同的Map对象
                    sendNavigationEvent("NavigationError", eventResponse)
                    promise.resolve(promiseResponse)
                }

                override fun onStatusUpdate(status: Int, data: String) {
                    Log.d(TAG, "Navigation status update - status: $status, data: $data")
                    
                    val statusResponse = WritableNativeMap()
                    statusResponse.putInt("statusCode", status)
                    statusResponse.putString("statusData", data)
                    statusResponse.putString("destination", destName)
                    
                    when (status) {
                        Definition.STATUS_NAVI_AVOID -> {
                            Log.i(TAG, "当前路线已经被障碍物堵死")
                            statusResponse.putString("statusType", "ROUTE_BLOCKED")
                            statusResponse.putString("message", "导航状态：路线被障碍物阻挡")
                            statusResponse.putString("description", "当前路线已被障碍物堵死，正在寻找替代路径")
                        }
                        Definition.STATUS_NAVI_AVOID_END -> {
                            Log.i(TAG, "障碍物已移除")
                            statusResponse.putString("statusType", "ROUTE_CLEAR")
                            statusResponse.putString("message", "导航状态：路线障碍已清除")
                            statusResponse.putString("description", "障碍物已移除，继续导航")
                        }
                        else -> {
                            statusResponse.putString("statusType", "OTHER")
                            statusResponse.putString("message", "导航状态更新")
                            statusResponse.putString("description", "导航状态：$data")
                        }
                    }
                    
                    sendNavigationEvent("NavigationStatusUpdate", statusResponse)
                }
            })
            
            // 检查RobotApi调用是否立即失败
            Log.d(TAG, "RobotApi.startNavigation call result: $callResult")
            if (callResult != 0) {
                // 如果返回值不是0，说明调用失败，立即返回错误
                Log.w(TAG, "RobotApi.startNavigation call failed with code: $callResult")
                val errorResponse = WritableNativeMap()
                errorResponse.putString("status", "error")
                errorResponse.putString("message", "Navigation API call failed")
                errorResponse.putString("destination", destName)
                errorResponse.putString("description", "机器人导航服务异常，无法启动导航")
                errorResponse.putInt("errorCode", callResult)
                promise.resolve(errorResponse)
                return
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in startNavigation method", e)
            val errorResponse = WritableNativeMap()
            errorResponse.putString("status", "error")
            errorResponse.putString("message", "Failed to start navigation: ${e.message}")
            errorResponse.putString("destination", destName)
            errorResponse.putBoolean("navigationStarted", false)
            errorResponse.putString("description", "启动导航时发生系统错误")
            promise.resolve(errorResponse)
        }
        
        Log.d(TAG, "=== AgentOSModule.startNavigation() finished ===")
    }

    @ReactMethod
    fun startNavigationWithCallback(destName: String, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.startNavigationWithCallback() called ===")
        Log.d(TAG, "Navigation destination: $destName")
        
        try {
            // 保存Promise用于后续回调
            val callbackId = System.currentTimeMillis().toString()
            navigationCallbacks[callbackId] = promise
            
            val callResult = RobotApi.getInstance().startNavigation(0, destName, 0.2, 30000, object : ActionListener() {
                override fun onResult(status: Int, response: String) {
                    Log.d(TAG, "Navigation result - status: $status, response: $response")
                    
                    when (status) {
                        Definition.RESULT_OK -> {
                            if ("true" == response) {
                                Log.i(TAG, "导航成功")
                                // 导航成功，通知React Native回调
                                currentActivity?.runOnUiThread {
                                    try {
                                        reactApplicationContext
                                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                            .emit("NavigationCallbackSuccess", WritableNativeMap().apply {
                                                putString("callbackId", callbackId)
                                                putString("destination", destName)
                                            })
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error sending navigation success callback", e)
                                    }
                                }
                            } else {
                                Log.i(TAG, "导航失败")
                                // 导航失败
                                currentActivity?.runOnUiThread {
                                    try {
                                        reactApplicationContext
                                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                            .emit("NavigationCallbackError", WritableNativeMap().apply {
                                                putString("callbackId", callbackId)
                                                putInt("errorCode", -1)
                                                putString("errorMessage", "Navigation failed")
                                                putString("destination", destName)
                                            })
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Error sending navigation error callback", e)
                                    }
                                }
                            }
                        }
                    }
                }

                override fun onError(errorCode: Int, errorString: String) {
                    Log.e(TAG, "Navigation error - code: $errorCode, message: $errorString")
                    
                    // 发送错误回调到React Native
                    currentActivity?.runOnUiThread {
                        try {
                            reactApplicationContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("NavigationCallbackError", WritableNativeMap().apply {
                                    putString("callbackId", callbackId)
                                    putInt("errorCode", errorCode)
                                    putString("errorMessage", errorString ?: "Unknown error")
                                    putString("destination", destName)
                                })
                        } catch (e: Exception) {
                            Log.e(TAG, "Error sending navigation error callback", e)
                        }
                    }
                }

                override fun onStatusUpdate(status: Int, data: String) {
                    Log.d(TAG, "Navigation status update - status: $status, data: $data")
                    
                    // 发送状态更新回调到React Native
                    currentActivity?.runOnUiThread {
                        try {
                            reactApplicationContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("NavigationCallbackStatusUpdate", WritableNativeMap().apply {
                                    putString("callbackId", callbackId)
                                    putInt("status", status)
                                    putString("data", data)
                                    putString("destination", destName)
                                })
                        } catch (e: Exception) {
                            Log.e(TAG, "Error sending navigation status callback", e)
                        }
                    }
                }
            })
            
            // 检查RobotApi调用是否立即失败
            Log.d(TAG, "RobotApi.startNavigation call result: $callResult")
            if (callResult != 0) {
                Log.w(TAG, "RobotApi.startNavigation call failed with code: $callResult")
                val errorResponse = WritableNativeMap()
                errorResponse.putString("status", "error")
                errorResponse.putString("message", "Navigation API call failed")
                errorResponse.putString("destination", destName)
                errorResponse.putString("description", "机器人导航服务异常，无法启动导航")
                errorResponse.putInt("errorCode", callResult)
                promise.resolve(errorResponse)
                navigationCallbacks.remove(callbackId)
                return
            }
            
            // 导航启动成功
            val successResponse = WritableNativeMap()
            successResponse.putString("status", "success")
            successResponse.putString("message", "Navigation started successfully")
            successResponse.putString("destination", destName)
            successResponse.putString("callbackId", callbackId)
            promise.resolve(successResponse)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in startNavigationWithCallback method", e)
            val errorResponse = WritableNativeMap()
            errorResponse.putString("status", "error")
            errorResponse.putString("message", "Failed to start navigation: ${e.message}")
            errorResponse.putString("destination", destName)
            errorResponse.putBoolean("navigationStarted", false)
            errorResponse.putString("description", "启动导航时发生系统错误")
            promise.resolve(errorResponse)
        }
        
        Log.d(TAG, "=== AgentOSModule.startNavigationWithCallback() finished ===")
    }

    /**
     * 发送导航事件到React Native
     */
    private fun sendNavigationEvent(eventName: String, data: WritableNativeMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)
            Log.d(TAG, "Navigation event sent: $eventName")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send navigation event: $eventName", e)
        }
    }
    
    /**
     * 异步处理Action执行逻辑（当ActionExecutor超时时使用）
     */
    private suspend fun handleActionExecutionAsync(action: Action, params: Bundle?) {
        Log.d(TAG, "=== handleActionExecutionAsync called ===")
        Log.d(TAG, "Action: ${action.name}, sid: ${action.sid}")
        
        try {
            // 发送事件到React Native，但不等待返回
            currentActivity?.runOnUiThread {
                handleActionExecution(action, params)
            }
            
            // 等待一段时间让React Native处理
            delay(3000)
            
            // 如果3秒后仍未收到回应，自动通知完成
            if (actionInstances.containsKey(action.sid)) {
                Log.w(TAG, "Async action handling timeout, auto-notifying completion for sid: ${action.sid}")
                actionInstances.remove(action.sid)
                try {
                    action.notify()
                } catch (e: Exception) {
                    Log.e(TAG, "Error notifying action completion", e)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in handleActionExecutionAsync", e)
            actionInstances.remove(action.sid)
            try {
                action.notify()
            } catch (notifyError: Exception) {
                Log.e(TAG, "Error notifying action after error", notifyError)
            }
        }
    }
} 