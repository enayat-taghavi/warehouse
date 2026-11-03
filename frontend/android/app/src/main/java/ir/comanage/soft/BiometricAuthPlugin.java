package ir.comanage.soft;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    private static final String PREFS_NAME = "comanage_biometric_prefs";
    private static final String PREF_KEY_CIPHERTEXT = "bio_encrypted_credentials";
    private static final String PREF_KEY_IV = "bio_iv";
    private static final String PREF_KEY_USERNAME = "bio_username";
    private static final String KEY_ALIAS = "CoManageBiometricMasterKey";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEYSTORE
            );
            KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build();
            keyGenerator.init(spec);
            return keyGenerator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        BiometricManager biometricManager = BiometricManager.from(context);
        int authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK;
        int canAuth = biometricManager.canAuthenticate(authenticators);

        JSObject ret = new JSObject();
        if (canAuth == BiometricManager.BIOMETRIC_SUCCESS) {
            ret.put("available", true);
            ret.put("enrolled", true);
            ret.put("reason", "SUCCESS");
        } else if (canAuth == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) {
            ret.put("available", true);
            ret.put("enrolled", false);
            ret.put("reason", "NONE_ENROLLED");
        } else {
            ret.put("available", false);
            ret.put("enrolled", false);
            ret.put("reason", "UNAVAILABLE_" + canAuth);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void hasSavedCredentials(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean hasSaved = prefs.contains(PREF_KEY_CIPHERTEXT) && prefs.contains(PREF_KEY_IV);
        String username = prefs.getString(PREF_KEY_USERNAME, null);

        JSObject ret = new JSObject();
        ret.put("hasSaved", hasSaved);
        if (username != null) {
            ret.put("username", username);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void saveCredentials(PluginCall call) {
        String username = call.getString("username");
        String password = call.getString("password");

        if (username == null || password == null || username.trim().isEmpty() || password.isEmpty()) {
            call.reject("نام کاربری و رمز عبور الزامی است.");
            return;
        }

        try {
            String combined = username + "\n" + password;
            SecretKey key = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(combined.getBytes(StandardCharsets.UTF_8));

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                .putString(PREF_KEY_USERNAME, username)
                .putString(PREF_KEY_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(PREF_KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .apply();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("خطا در ذخیره‌سازی امن اعتبارنامه: " + e.getMessage());
        }
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Context context = getContext();
                if (!(getActivity() instanceof FragmentActivity)) {
                    call.reject("Activity is not a FragmentActivity");
                    return;
                }
                FragmentActivity activity = (FragmentActivity) getActivity();
                Executor executor = ContextCompat.getMainExecutor(context);

                String title = call.getString("title", "ورود با اثر انگشت یا تشخیص چهره");
                String subtitle = call.getString("subtitle", "برای ورود به سامانه هویت خود را تأیید کنید");
                String cancelButtonText = call.getString("cancelButtonText", "انصراف");

                BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setNegativeButtonText(cancelButtonText)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.BIOMETRIC_WEAK)
                    .build();

                BiometricPrompt biometricPrompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                            super.onAuthenticationError(errorCode, errString);
                            JSObject ret = new JSObject();
                            ret.put("success", false);
                            ret.put("error", errString.toString());
                            ret.put("errorCode", errorCode);
                            call.resolve(ret);
                        }

                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            super.onAuthenticationSucceeded(result);
                            try {
                                SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                                String cipherB64 = prefs.getString(PREF_KEY_CIPHERTEXT, null);
                                String ivB64 = prefs.getString(PREF_KEY_IV, null);

                                if (cipherB64 == null || ivB64 == null) {
                                    JSObject ret = new JSObject();
                                    ret.put("success", false);
                                    ret.put("error", "اعتبارنامه ذخیره‌شده یافت نشد.");
                                    call.resolve(ret);
                                    return;
                                }

                                byte[] ciphertext = Base64.decode(cipherB64, Base64.NO_WRAP);
                                byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);

                                SecretKey key = getOrCreateSecretKey();
                                Cipher cipher = Cipher.getInstance(TRANSFORMATION);
                                cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
                                byte[] plaintextBytes = cipher.doFinal(ciphertext);
                                String decrypted = new String(plaintextBytes, StandardCharsets.UTF_8);
                                String[] parts = decrypted.split("\n", 2);

                                JSObject ret = new JSObject();
                                ret.put("success", true);
                                ret.put("username", parts[0]);
                                ret.put("password", parts.length > 1 ? parts[1] : "");
                                call.resolve(ret);
                            } catch (Exception e) {
                                JSObject ret = new JSObject();
                                ret.put("success", false);
                                ret.put("error", "خطا در رمزگشایی اطلاعات: " + e.getMessage());
                                call.resolve(ret);
                            }
                        }

                        @Override
                        public void onAuthenticationFailed() {
                            super.onAuthenticationFailed();
                            // سیستم اندروید خود بازخورد عدم تطابق را در دیالوگ نمایش می‌دهد
                        }
                    });

                biometricPrompt.authenticate(promptInfo);
            } catch (Exception e) {
                call.reject("خطا در راه‌اندازی سنسور بیومتریک: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearCredentials(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .remove(PREF_KEY_CIPHERTEXT)
            .remove(PREF_KEY_IV)
            .remove(PREF_KEY_USERNAME)
            .apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
