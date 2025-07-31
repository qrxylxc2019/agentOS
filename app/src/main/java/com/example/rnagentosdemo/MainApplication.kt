package com.example.rnagentosdemo

import android.app.Application
import android.os.Bundle
import android.util.Log
import com.ainirobot.agent.AppAgent
import com.ainirobot.agent.action.Action
import com.ainirobot.agent.action.Actions
import com.ainirobot.coreservice.client.RobotApi
import com.ainirobot.coreservice.client.ApiListener
import com.ainirobot.coreservice.client.module.ModuleCallbackApi
import android.os.RemoteException
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
    }

    lateinit var appAgent: AppAgent
    private var isRobotApiConnected = false

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
} 