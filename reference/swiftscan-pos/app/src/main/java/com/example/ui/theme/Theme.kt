package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme =
  darkColorScheme(
    primary = BlueSecondary,
    secondary = OrangeAccent,
    tertiary = YellowAccent,
    background = DarkBlueBackground,
    surface = DarkBlueSurface,
    onPrimary = TextLight,
    onSecondary = TextLight,
    onTertiary = TextDark,
    onBackground = TextLight,
    onSurface = TextLight
  )

private val LightColorScheme =
  lightColorScheme(
    primary = BluePrimary,
    secondary = OrangeAccent,
    tertiary = YellowAccent,
    background = OffWhite,
    surface = androidx.compose.ui.graphics.Color.White,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    onSecondary = androidx.compose.ui.graphics.Color.White,
    onTertiary = TextDark,
    onBackground = TextDark,
    onSurface = TextDark,
  )

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  // Disable dynamic color to enforce our customized beautiful branding
  dynamicColor: Boolean = false,
  content: @Composable () -> Unit,
) {
  val colorScheme =
    when {
      dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = LocalContext.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
      }

      darkTheme -> DarkColorScheme
      else -> LightColorScheme
    }

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
