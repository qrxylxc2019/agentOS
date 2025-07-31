package com.example.rnagentosdemo

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.ainirobot.agent.AgentCore
import com.ainirobot.agent.OnTranscribeListener
import com.ainirobot.agent.OnAgentStatusChangedListener
import com.ainirobot.agent.PageAgent
import com.ainirobot.agent.action.Actions
import com.ainirobot.agent.base.Transcription
import android.util.Log

class ChatActivity : AppCompatActivity() {

    private lateinit var pageAgent: PageAgent
    private lateinit var rvChatMessages: RecyclerView
    private lateinit var etInput: EditText
    private lateinit var btnSend: Button
    private lateinit var btnVoice: Button
    private lateinit var btnReactNative: Button
    private lateinit var btnFeatures: Button
    private lateinit var tvTitle: TextView
    
    private lateinit var chatAdapter: ChatAdapter
    private val messages = mutableListOf<ChatMessage>()
    private var isListening = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)

        initViews()
        initPageAgent()
        initChatList()
        initListeners()
        
        // 添加欢迎消息
        addBotMessage("你好！我是智能助手，有什么可以帮助你的吗？")
    }

    override fun onStart() {
        super.onStart()
        
        // 清理上下文，确保每次启动都是干净的状态
        AgentCore.stopTTS()
        AgentCore.clearContext()
        
        // 重新上传页面信息
        AgentCore.uploadInterfaceInfo("这是一个聊天界面，用户可以通过语音或文本与智能助手进行对话交流。")
        
        Log.d("ChatActivity", "onStart: 页面已启动，Agent已初始化")
    }

    override fun onResume() {
        super.onResume()
        // 确保麦克风可用
        AgentCore.isMicrophoneMuted = false
        Log.d("ChatActivity", "onResume: 麦克风已启用")
    }

    private fun initViews() {
        rvChatMessages = findViewById(R.id.rvChatMessages)
        etInput = findViewById(R.id.etInput)
        btnSend = findViewById(R.id.btnSend)
        btnVoice = findViewById(R.id.btnVoice)
        btnReactNative = findViewById(R.id.btnReactNative)
        btnFeatures = findViewById(R.id.btnFeatures)
        tvTitle = findViewById(R.id.tvTitle)
    }

    private fun initPageAgent() {
        pageAgent = PageAgent(this)
        pageAgent.setPersona("你是一个友好、热情的聊天助手，能够与用户进行自然流畅的对话交流。")
        pageAgent.setObjective("通过自然的对话为用户提供帮助，让用户感受到温暖和陪伴。")
        
        // 注册系统Actions，特别是SAY Action用于语音回复
        pageAgent.registerAction(Actions.SAY)
        
        // 设置Agent状态监听器
        pageAgent.setOnAgentStatusChangedListener(object : OnAgentStatusChangedListener {
            override fun onStatusChanged(status: String, message: String?): Boolean {
                Log.d("ChatActivity", "Agent状态变化: $status, 消息: $message")
                // 不显示状态消息到聊天界面，避免干扰正常对话
                return false // 不消费，让系统继续处理
            }
        })
        
        // 设置语音转文字监听
        pageAgent.setOnTranscribeListener(object : OnTranscribeListener {
            override fun onASRResult(transcription: Transcription): Boolean {
                Log.d("ChatActivity", "ASR结果: ${transcription.text}, final: ${transcription.final}")
                if (transcription.text.isNotEmpty() && transcription.final) {
                    runOnUiThread {
                        addUserMessage(transcription.text)
                        btnVoice.text = "语音"
                        isListening = false
                    }
                }
                return false // 不消费结果，让系统继续处理
            }

            override fun onTTSResult(transcription: Transcription): Boolean {
                Log.d("ChatActivity", "TTS结果: ${transcription.text}, final: ${transcription.final}")
                if (transcription.text.isNotEmpty() && transcription.final) {
                    runOnUiThread {
                        addBotMessage(transcription.text)
                    }
                }
                return false // 不消费结果，让系统继续处理
            }
        })
        
        // 上传页面信息
        AgentCore.uploadInterfaceInfo("这是一个聊天界面，用户可以通过语音或文本与智能助手进行对话交流。")
    }

    private fun initChatList() {
        chatAdapter = ChatAdapter(messages)
        rvChatMessages.layoutManager = LinearLayoutManager(this)
        rvChatMessages.adapter = chatAdapter
    }

    private fun initListeners() {
        btnSend.setOnClickListener {
            val message = etInput.text.toString().trim()
            if (message.isNotEmpty()) {
                addUserMessage(message)
                etInput.setText("")
                
                // 发送文本指令给AgentOS处理
                AgentCore.query(message)
            }
        }

        btnVoice.setOnClickListener {
            if (!isListening) {
                // 开始语音输入 - 控制麦克风静音状态
                AgentCore.isMicrophoneMuted = false
                btnVoice.text = "听取中..."
                isListening = true
            } else {
                // 停止语音输入
                AgentCore.isMicrophoneMuted = true
                btnVoice.text = "语音"
                isListening = false
            }
        }

        btnReactNative.setOnClickListener {
            val intent = Intent(this, ReactNativeActivity::class.java)
            startActivity(intent)
        }

        btnFeatures.setOnClickListener {
            addBotMessage("🎉 恭喜！您已成功创建了一个混合开发项目！\n\n✅ AgentOS SDK集成完成\n✅ React Native聊天页面正常运行\n✅ 原生Android聊天功能正常\n✅ 双向页面跳转功能完备\n\n现在可以对比两种开发方式的差异！")
        }
    }

    private fun addUserMessage(message: String) {
        messages.add(ChatMessage(message, true))
        chatAdapter.notifyItemInserted(messages.size - 1)
        scrollToBottom()
    }

    private fun addBotMessage(message: String) {
        messages.add(ChatMessage(message, false))
        chatAdapter.notifyItemInserted(messages.size - 1)
        scrollToBottom()
    }

    private fun scrollToBottom() {
        rvChatMessages.scrollToPosition(messages.size - 1)
    }

    override fun onDestroy() {
        super.onDestroy()
        
        // 清理资源
        AgentCore.stopTTS()
        AgentCore.clearContext()
        
        Log.d("ChatActivity", "onDestroy: 页面已销毁，资源已清理")
    }
} 