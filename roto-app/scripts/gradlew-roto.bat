@echo off
rem ---------------------------------------------------------------------------
rem Gradle wrapper for this machine (Windows, 2026-09-28).
rem
rem Two Windows facts are handled here, and both are silent failures if you skip them:
rem
rem  1. JAVA_HOME must point at the JDK ROOT, not at bin\. Gradle fails with an
rem     unhelpful message otherwise.
rem
rem  2. The build must run from the REAL path (D:\Work\Weekend Projects\...), NOT from
rem     a subst drive. @react-native/codegen compares input roots and dies with
rem     "this and base files have different roots" when one path resolves to R:\ and
rem     the other to D:\. That means `subst R:` is useful for npm/next but NOT for gradle.
rem
rem Usage:  scripts\gradlew-roto.bat :app:assembleDebug
rem Lives outside apps/native/android on purpose — that directory is gitignored and is
rem recreated by `npx expo prebuild`, so a wrapper stored there would vanish.
rem ---------------------------------------------------------------------------
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=D:\Work\Weekend Projects\roto\roto-app\node_modules\.bin;%PATH%"
cd /d "D:\Work\Weekend Projects\roto\roto-app\apps\native\android"
call gradlew.bat %*
