plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.example.rnagentosdemo"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.rnagentosdemo"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
}

dependencies {
    implementation("com.orionstar.agent:sdk:0.3.5-SNAPSHOT") // 【重要配置】Agent SDK依赖
    
    // React Native依赖 - 使用更稳定的0.73版本
    implementation("com.facebook.react:react-android:0.73.9")
    implementation("com.facebook.react:hermes-android:0.73.9")
    
    // 以下是Android标准库，默认kotlin项目都会依赖，
    // 如果编译报未找到错误，再添加以下依赖库
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.6.1")

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}



