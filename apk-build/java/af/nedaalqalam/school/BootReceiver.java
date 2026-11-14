package af.nedaalqalam.school;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * بازگردانی سرویس اعلان پس از روشن‌شدن گوشی — نسخهٔ ۳.۰.۰
 * تا اعلان‌های مکتب پس از ری‌استارت هم قطع نشوند.
 * (BOOT_COMPLETED فقط توسط سیستم فرستاده می‌شود — امن است)
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        try {
            Intent i = new Intent(context, NotifyService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(i);
            } else {
                context.startService(i);
            }
        } catch (Exception ignored) { /* هرگز کرش نمی‌کنیم */ }
    }
}
