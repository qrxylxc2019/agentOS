package com.example.rnagentosdemo

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

class ChatAdapter(private val messages: List<ChatMessage>) : 
    RecyclerView.Adapter<ChatAdapter.ChatViewHolder>() {

    class ChatViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val layoutUserMessage: LinearLayout = itemView.findViewById(R.id.layoutUserMessage)
        val layoutBotMessage: LinearLayout = itemView.findViewById(R.id.layoutBotMessage)
        val tvUserMessage: TextView = itemView.findViewById(R.id.tvUserMessage)
        val tvBotMessage: TextView = itemView.findViewById(R.id.tvBotMessage)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChatViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_chat_message, parent, false)
        return ChatViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChatViewHolder, position: Int) {
        val message = messages[position]
        
        if (message.isUser) {
            // 显示用户消息
            holder.layoutUserMessage.visibility = View.VISIBLE
            holder.layoutBotMessage.visibility = View.GONE
            holder.tvUserMessage.text = message.text
        } else {
            // 显示机器人消息
            holder.layoutUserMessage.visibility = View.GONE
            holder.layoutBotMessage.visibility = View.VISIBLE
            holder.tvBotMessage.text = message.text
        }
    }

    override fun getItemCount(): Int = messages.size
} 