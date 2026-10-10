package io.github.theaob.gamedevstudio;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.tasks.Task;

/**
 * Google Play Games Services (v2): sign-in, unlocking achievements and the achievements screen.
 * Only active when the build has a Play Games project ID (PLAY_GAMES_RESOURCES, see README
 * "Google Play Games"). Without one every call answers "not configured" and nothing loads.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_ACHIEVEMENTS = 9003;
    private boolean configured;

    @Override
    public void load() {
        configured = !getContext().getString(R.string.game_services_project_id).isEmpty();
        // Initialising also signs the player in automatically if they've used Play Games before.
        if (configured) PlayGamesSdk.initialize(getContext());
    }

    /** { configured, authenticated } */
    @PluginMethod
    public void status(PluginCall call) {
        if (!configured) {
            resolveStatus(call, false);
            return;
        }
        PlayGames.getGamesSignInClient(getActivity())
            .isAuthenticated()
            .addOnCompleteListener(task -> resolveStatus(call, authenticated(task)));
    }

    /** Asks the player to sign in (shows Play Games' own sign-in UI). Resolves with the new status. */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!configured) {
            resolveStatus(call, false);
            return;
        }
        PlayGames.getGamesSignInClient(getActivity())
            .signIn()
            .addOnCompleteListener(task -> resolveStatus(call, authenticated(task)));
    }

    /** Unlocks an achievement by its Play Games ID. Unlocking one that's already unlocked is harmless. */
    @PluginMethod
    public void unlock(PluginCall call) {
        String id = call.getString("id");
        if (!configured || id == null || id.isEmpty()) {
            call.reject("Play Games is not configured");
            return;
        }
        PlayGames.getAchievementsClient(getActivity()).unlock(id);
        call.resolve();
    }

    /** Opens Play Games' achievements screen. */
    @PluginMethod
    public void showAchievements(PluginCall call) {
        if (!configured) {
            call.reject("Play Games is not configured");
            return;
        }
        PlayGames.getAchievementsClient(getActivity())
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> {
                getActivity().startActivityForResult(intent, RC_ACHIEVEMENTS);
                call.resolve();
            })
            .addOnFailureListener(e -> call.reject("Could not open Play Games achievements", e));
    }

    private static boolean authenticated(Task<AuthenticationResult> task) {
        return task.isSuccessful() && task.getResult() != null && task.getResult().isAuthenticated();
    }

    private void resolveStatus(PluginCall call, boolean authenticated) {
        JSObject ret = new JSObject();
        ret.put("configured", configured);
        ret.put("authenticated", authenticated);
        call.resolve(ret);
    }
}
