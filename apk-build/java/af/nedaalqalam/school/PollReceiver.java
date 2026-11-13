package af.nedaalqalam.school;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * بازگردانی سرویس اعلان پس از روشن‌شدن گوشی — نسخهٔ ۳.۰.۰
 * تا اعلان‌های مکتب پس از ری‌استارت هم قطع نشوند.
 * (اگر سیستم اجازهٔ شروع از پس‌زمینه ندهد، بی‌صدا رد می‌شود — هرگز کرش نیست)
 */
public class PollReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            Intent i = new Intent(context, NotifyService.class);
            i.setAction("POLL");
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(i);
            } else {
                context.startService(i);
            }
        } catch (Exception ignored) { /* هرگز کرش نمی‌کنیم */ }
    }
}
