package com.example.rnagentosdemo

import android.app.Application
import android.os.Bundle
import android.util.Log
import com.ainirobot.agent.AgentCore
import com.ainirobot.agent.AppAgent
import com.ainirobot.agent.action.Action
import com.ainirobot.agent.action.ActionExecutor
import com.ainirobot.agent.action.Actions
import com.ainirobot.agent.base.Parameter
import com.ainirobot.agent.base.ParameterType
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.ApiListener
import com.ainirobot.coreservice.client.module.ModuleCallbackApi
import android.os.RemoteException
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import okio.BufferedSource
import java.io.BufferedReader
import java.io.InputStreamReader
// import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

    companion object {
        private const val TAG = "MainApplication"
        
        // 全局sessionId变量，当检测不到人脸时需要清空
        @Volatile
        var sessionId: String = ""
        
        // 用户ID计数器，每次新会话递增
        private val userIdCounter = AtomicInteger(1)
        
        // 获取当前用户ID
        val userId: String
            get() = userIdCounter.get().toString()
    }

    lateinit var appAgent: AppAgent
    private var isRobotApiConnected = false
    
    // HTTP客户端
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> {
                val packages = mutableListOf<ReactPackage>()
                // 添加React Native核心包
                packages.add(com.facebook.react.shell.MainReactPackage())
                // 添加自定义导航包
                packages.add(NavigationPackage())
                return packages
            }
            override fun getJSMainModuleName(): String = "index"
            override fun getUseDeveloperSupport(): Boolean = false
            override val isNewArchEnabled: Boolean = false
            override val isHermesEnabled: Boolean = true
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()

        Log.d(TAG, "MainApplication onCreate() started")

        // 初始化React Native
        SoLoader.init(this, false)

        // ⚠️ 重要：必须在Application.onCreate()中初始化RobotSDK
        initializeRobotSDK()

        // 初始化AgentOS
        appAgent = object : AppAgent(this@MainApplication) {
            override fun onCreate() {
                // 设定基础人设
                setPersona("你是一个友好、热情的聊天助手，能够与用户进行自然流畅的对话交流。")
                // 设定目标
                setObjective("通过自然的对话为用户提供帮助，让用户感受到温暖和陪伴。")
                
                // 注册系统Actions
                registerAction(Actions.SAY)
                
                Log.d("zixun", "plan_xml 注册社保咨询Action")
                // 注册社保问答Action
                val socialInsuranceAction = Action(
                    name = "com.policy.agent.SOCIAL_SECURITY_QA",
                    displayName = "社保政策咨询",
                    desc = "回答用户关于社保政策的各类问题，包括社保、社保卡、养老保险、失业保险、工伤保险、医疗保险、生育保险、住房公积金等相关政策咨询",
                    parameters = listOf(
                        Parameter(
                            name = "question",
                            type = ParameterType.STRING,
                            desc = "用户关于社保政策的具体问题，如'查询社保基数'、'社保卡如何办理'、'养老保险缴费标准'等",
                            required = true
                        )
                    ),
                    executor = object : ActionExecutor {
                        override fun onExecute(action: Action, params: Bundle?): Boolean {
                            // 处理社保咨询逻辑
                            Log.d("zixun", "plan_xml 收到社保咨询问题: " + params?.toString())
                            // 打印Bundle中的所有键值对
                            if (params != null) {
                                for (key in params.keySet()) {
                                    Log.d("zixun", "params[$key] = ${params.get(key)}")
                                }
                            }
                            // 获取参数
                            val question = params?.getString("question")
                            
                            if (!question.isNullOrEmpty()) {
                                // 异步调用问答接口
                                CoroutineScope(Dispatchers.IO).launch {
                                    try {
                                        callQuestionAnswerAPI(question)
                                    } catch (e: Exception) {
                                        Log.e("zixun", "调用问答接口失败", e)
                                    }
                                }
                            }
                            
                            return false
                        }
                    }
                )
                registerAction(socialInsuranceAction)
            }

            override fun onExecuteAction(
                action: Action,
                params: Bundle?
            ): Boolean {
                // 在此处处理静态注册的action，如果你不需要处理，请返回false，如果要自行处理且不需要后续处理，则返回true
                return false
            }
        }


        Log.d(TAG, "MainApplication onCreate() completed")
    }

    /**
     * 初始化RobotSDK - 必须在Application.onCreate()中调用
     */
    private fun initializeRobotSDK() {
        Log.d(TAG, "Initializing RobotSDK...")
        
        try {
            // 创建模块回调接口
            val moduleCallback = object : ModuleCallbackApi() {
                @Throws(RemoteException::class)
                override fun onSendRequest(reqId: Int, reqType: String?, reqText: String?, reqParam: String?): Boolean {
                    // 这个回调已废弃
                    Log.d(TAG, "ModuleCallback.onSendRequest (deprecated): reqId=$reqId, type=$reqType, text=$reqText")
                    return true
                }

                @Throws(RemoteException::class)
                override fun onRecovery() {
                    // 控制权恢复，收到该事件后，重新恢复对机器人的控制
                    Log.i(TAG, "Robot control recovered - ready to control robot")
                    isRobotApiConnected = true
                }

                @Throws(RemoteException::class)
                override fun onSuspend() {
                    // 控制权被系统剥夺，收到该事件后，所有Api调用无效
                    Log.w(TAG, "Robot control suspended - all API calls will be invalid")
                    isRobotApiConnected = false
                }
            }

            // 连接RobotAPI服务器
            RobotApi.getInstance().connectServer(this, object : ApiListener {
                override fun handleApiDisabled() {
                    Log.w(TAG, "RobotAPI is disabled")
                    isRobotApiConnected = false
                }

                override fun handleApiConnected() {
                    Log.i(TAG, "RobotAPI connected successfully")
                    isRobotApiConnected = true
                    
                    try {
                        // 设置模块回调
                        RobotApi.getInstance().setCallback(moduleCallback)
                        Log.d(TAG, "RobotAPI module callback set successfully")
                        
                        
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to set RobotAPI callback", e)
                    }
                }

                override fun handleApiDisconnected() {
                    Log.w(TAG, "RobotAPI disconnected")
                    isRobotApiConnected = false
                }
            })

            Log.d(TAG, "RobotSDK initialization request sent")
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize RobotSDK", e)
            isRobotApiConnected = false
        }
    }

    /**
     * 检查RobotAPI是否已连接
     */
    fun isRobotApiConnected(): Boolean {
        return isRobotApiConnected
    }
    
    /**
     * 调用问答接口
     */
    private suspend fun callQuestionAnswerAPI(question: String) {
        withContext(Dispatchers.IO) {
            try {
                Log.d("zixun", "开始调用问答接口，问题: $question")
                
                // 构建请求参数
                val requestJson = JSONObject().apply {
                    put("think", false)
                    put("question", question)
                    put("sessionId", sessionId)
                    put("userId", userId)
                    put("apiKey", "tecsun-1385cd856e7a11f08135525400d15cf7")
                    put("channel", "实体机器人")
                    put("channelSign", "1950469775473905664")
                    put("responseMode", "streaming") // 使用阻塞模式便于处理响应
                }
                
                Log.d("zixun", "请求参数: $requestJson")
                
                // 创建请求体
                val mediaType = "application/json; charset=utf-8".toMediaType()
                val requestBody = requestJson.toString().toRequestBody(mediaType)
                
                // 构建请求
                val request = Request.Builder()
                    .url("https://zhiliao.e-tecsun.com/kefu-api/answer/streamChat")
                    .post(requestBody)
                    .addHeader("Content-Type", "application/json")
                    .build()
                
                // 发送请求
                httpClient.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e("zixun", "问答接口调用失败", e)
                    }
                    
                    override fun onResponse(call: Call, response: Response) {
                        try {
                            if (response.isSuccessful) {
                                val responseBody = response.body
                                if (responseBody != null) {
                                    // 处理流式响应
                                    handleStreamingResponse(responseBody)
                                }
                            } else {
                                Log.e("zixun", "问答接口响应失败: ${response.code}")
                            }
                        } catch (e: Exception) {
                            Log.e("zixun", "处理问答接口响应失败", e)
                        } finally {
                            response.close()
                        }
                    }
                })
                
            } catch (e: Exception) {
                Log.e("zixun", "构建问答接口请求失败", e)
            }
        }
    }
    
    /**
     * 处理流式响应
     */
    private fun handleStreamingResponse(responseBody: ResponseBody) {
        try {
            val inputStream = responseBody.byteStream()
            val reader = BufferedReader(InputStreamReader(inputStream, "UTF-8"))
            
            val fullAnswer = StringBuilder()
            var currentSessionId = ""
            var messageId = ""
            
            reader.use { bufferedReader ->
                var line: String?
                while (bufferedReader.readLine().also { line = it } != null) {
                    line?.let { jsonLine ->
                        if (jsonLine.trim().isNotEmpty()) {
                            try {
                                // 解析每一行JSON
                                val jsonObject = JSONObject(jsonLine)
                                
                                // 获取答案片段
                                val answerPart = if (jsonObject.has("answer")) {
                                    jsonObject.getString("answer")
                                } else {
                                    ""
                                }
                                
                                // 获取messageId
                                if (jsonObject.has("messageId")) {
                                    messageId = jsonObject.getString("messageId")
                                }
                                
                                // 累积答案
                                if (answerPart.isNotEmpty()) {
                                    fullAnswer.append(answerPart)
                                    
                                    // 实时打印每个片段
                                    Log.d("zixun", "答案片段: '$answerPart'")
                                    
                                    // 通过AgentCore实时播放答案片段
                                    AgentCore.tts("123",90000, object : TTSCallback {
                                        override fun onTaskEnd(status: Int, result: String?) {

                                        }
                                    })
                                }
                                
                            } catch (e: Exception) {
                                Log.e("zixun", "解析JSON行失败: $jsonLine", e)
                            }
                        }
                    }
                }
            }
            
            // 流式响应结束，打印最终结果
            val finalAnswer = fullAnswer.toString()
            Log.d("zixun", "【响应完成】")
            Log.d("zixun", "最终答案: $finalAnswer")
            
            // 这里可以通过AgentCore说出完整答案
            // 例如：AgentCore.say(finalAnswer)
            
        } catch (e: Exception) {
            Log.e("zixun", "处理流式响应失败", e)
        }
    }
    
    /**
     * 生成新的会话ID（当开始新对话时调用）
     */
    fun generateNewSessionId() {
        sessionId = "session_${System.currentTimeMillis()}_${userIdCounter.incrementAndGet()}"
        Log.d("zixun", "生成新的sessionId: $sessionId")
    }
    
    /**
     * 清空会话ID（当检测不到人脸时调用）
     */
    fun clearSessionId() {
        sessionId = ""
        Log.d("zixun", "已清空sessionId")
    }
    
    override fun onTerminate() {
        super.onTerminate()
    }
} 