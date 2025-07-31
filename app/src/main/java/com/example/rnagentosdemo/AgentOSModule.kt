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
import android.os.Bundle
import kotlinx.coroutines.*
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import com.ainirobot.agent.AgentCore
import com.ainirobot.agent.PageAgent
import com.ainirobot.agent.action.Action
import com.ainirobot.agent.action.ActionExecutor
import com.ainirobot.agent.base.Parameter
import com.ainirobot.agent.base.ParameterType
import com.ainirobot.agent.base.ActionResult
import com.ainirobot.agent.base.ActionStatus

class AgentOSModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AgentOSModule"
    }

    // 存储PageAgent实例的Map，以pageId为key
    private val pageAgents = mutableMapOf<String, PageAgent>()
    
    // 存储Action执行结果等待的协程续体，以actionSid为key
    private val actionContinuations = mutableMapOf<String, Continuation<Boolean>>()
    
    // 存储Action实例，以actionSid为key，用于后续调用notify()
    private val actionInstances = mutableMapOf<String, Action>()

    override fun getName(): String {
        return "AgentOSModule"
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
                    
                    // 使用协程同步等待React Native的返回值
                    return runBlocking {
                        Log.d(TAG, "Starting coroutine to wait for RN response")
                        
                        // 启动协程发送事件到React Native并等待返回值
                        suspendCancellableCoroutine<Boolean> { continuation ->
                            // 存储协程续体和Action实例，等待React Native调用回应
                            actionContinuations[action.sid] = continuation
                            actionInstances[action.sid] = action
                            
                            // 在主线程中发送事件到React Native
                            currentActivity?.runOnUiThread {
                                handleActionExecution(action, params)
                            }
                            
                            // 设置超时处理
                            continuation.invokeOnCancellation {
                                Log.w(TAG, "Action execution timeout or cancelled for sid: ${action.sid}")
                                actionContinuations.remove(action.sid)
                                actionInstances.remove(action.sid)
                            }
                        }
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
            // 出错时恢复协程并返回false，同时清理Action实例
            val continuation = actionContinuations.remove(action.sid)
            val actionInstance = actionInstances.remove(action.sid)
            continuation?.resume(false)
            // 如果有Action实例，也需要调用notify告知失败
            actionInstance?.notify(ActionResult(ActionStatus.FAILED))
        }
        
        Log.d(TAG, "=== handleActionExecution() finished ===")
    }

    // =============== Action执行结果回调方法 ===============
    
    @ReactMethod
    fun respondToActionExecution(actionSid: String, success: Boolean, promise: Promise) {
        Log.d(TAG, "=== AgentOSModule.respondToActionExecution() called ===")
        Log.d(TAG, "ActionSid: '$actionSid', Success: $success")
        
        try {
            // 找到等待的协程续体（注意：不remove actionInstances，notify时还需要用）
            val continuation = actionContinuations.remove(actionSid)
            
            if (continuation != null) {
                Log.d(TAG, "Found waiting continuation for actionSid: $actionSid")
                
                // 恢复协程，返回React Native提供的ActionExecutor结果
                continuation.resume(success)
                
                // 返回成功响应
                val result = WritableNativeMap()
                result.putString("status", "success")
                result.putString("message", "ActionExecutor returned with result")
                result.putString("actionSid", actionSid)
                result.putBoolean("success", success)
                promise.resolve(result)
            } else {
                Log.w(TAG, "No waiting continuation or action found for actionSid: $actionSid")
                promise.reject("ACTION_NOT_FOUND", "No waiting action found for sid: $actionSid")
            }
            
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
            val action = actionInstances[actionSid] // 注意：这里不remove，因为可能还需要用
            
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
} 