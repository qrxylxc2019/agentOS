package com.example.rnagentosdemo

import android.app.Application
import android.os.Bundle
import com.ainirobot.agent.AppAgent
import com.ainirobot.agent.action.Action
import com.ainirobot.agent.action.Actions
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

    lateinit var appAgent: AppAgent

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

        // 初始化React Native
        SoLoader.init(this, false)

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
    }
} 