package com.example.rnagentosdemo

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class ReactNativeActivity : ReactActivity() {

    /**
     * 返回在index.js中注册的React Native组件名称
     */
    override fun getMainComponentName(): String = "RNAgentOSDemo"

    /**
     * 返回ReactActivityDelegate实例，它允许您在React Native运行时启用New Architecture。
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
} 