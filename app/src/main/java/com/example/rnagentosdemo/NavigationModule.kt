package com.example.rnagentosdemo

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NavigationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "NavigationModule"
    }

    @ReactMethod
    fun goToChatActivity() {
        val intent = Intent(currentActivity, ChatActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        currentActivity?.startActivity(intent)
    }

    @ReactMethod
    fun goToReactNative() {
        val intent = Intent(currentActivity, ReactNativeActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        currentActivity?.startActivity(intent)
    }
} 