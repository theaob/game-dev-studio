package io.github.theaob.gamedevstudio;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesClientStatusCodes;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Google Play Games Services (v2): sign-in, unlocking achievements, submitting leaderboard scores,
 * the Play Games achievements and leaderboards screens, and cloud saves (Saved Games).
 * Only active when the build has a Play Games project ID (PLAY_GAMES_RESOURCES, see README
 * "Google Play Games"). Without one every call answers "not configured" and nothing loads.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {

    private static final int RC_ACHIEVEMENTS = 9003;
    private static final int RC_LEADERBOARDS = 9004;
    /** Conflicts left after the SDK's own resolution, resolved here in turn before giving up. */
    private static final int MAX_CONFLICT_RETRIES = 3;
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

    /**
     * Submits a leaderboard score by the board's Play Games ID. Play Games keeps the player's best,
     * so submitting a lower score is harmless. The score is a whole number in the board's units.
     */
    @PluginMethod
    public void submitScore(PluginCall call) {
        String id = call.getString("id");
        Double score = call.getDouble("score");
        if (!configured || id == null || id.isEmpty() || score == null || score < 0) {
            call.reject("Play Games is not configured");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity()).submitScore(id, score.longValue());
        call.resolve();
    }

    /** Opens Play Games' list of the game's leaderboards. */
    @PluginMethod
    public void showLeaderboards(PluginCall call) {
        if (!configured) {
            call.reject("Play Games is not configured");
            return;
        }
        PlayGames.getLeaderboardsClient(getActivity())
            .getAllLeaderboardsIntent()
            .addOnSuccessListener(intent -> {
                getActivity().startActivityForResult(intent, RC_LEADERBOARDS);
                call.resolve();
            })
            .addOnFailureListener(e -> call.reject("Could not open Play Games leaderboards", e));
    }

    /**
     * Reads a cloud save. Resolves with { found: false } when there is none, or with
     * { found: true, data, modified } (the saved text and when it was last written, in ms).
     */
    @PluginMethod
    public void loadSnapshot(PluginCall call) {
        String name = call.getString("name");
        if (!configured || name == null || name.isEmpty()) {
            call.reject("Play Games is not configured");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        openResolved(client, name, false, 0)
            .addOnSuccessListener(snapshot -> {
                try {
                    String data = new String(snapshot.getSnapshotContents().readFully(), StandardCharsets.UTF_8);
                    JSObject ret = new JSObject();
                    ret.put("found", !data.isEmpty());
                    ret.put("data", data);
                    ret.put("modified", snapshot.getMetadata().getLastModifiedTimestamp());
                    call.resolve(ret);
                } catch (IOException e) {
                    call.reject("Could not read the cloud save", e);
                } finally {
                    client.discardAndClose(snapshot);
                }
            })
            .addOnFailureListener(e -> {
                if (e instanceof ApiException && ((ApiException) e).getStatusCode() == GamesClientStatusCodes.SNAPSHOT_NOT_FOUND) {
                    JSObject ret = new JSObject();
                    ret.put("found", false);
                    call.resolve(ret);
                } else {
                    call.reject("Could not open the cloud save", e);
                }
            });
    }

    /** Writes a cloud save: { name, data, description }. Resolves with { modified } once it's committed. */
    @PluginMethod
    public void saveSnapshot(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        String description = call.getString("description", "");
        if (!configured || name == null || name.isEmpty() || data == null) {
            call.reject("Play Games is not configured");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        openResolved(client, name, true, 0)
            .onSuccessTask(snapshot -> {
                snapshot.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
                SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription(description).build();
                return client.commitAndClose(snapshot, change);
            })
            .addOnSuccessListener(metadata -> {
                JSObject ret = new JSObject();
                ret.put("modified", metadata.getLastModifiedTimestamp());
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("Could not write the cloud save", e));
    }

    /**
     * Opens a save, letting the SDK keep the most recently modified copy when two devices wrote it
     * at once. If a conflict still comes back, this keeps the newer copy and tries again.
     */
    private Task<Snapshot> openResolved(SnapshotsClient client, String name, boolean create, int retries) {
        return client
            .open(name, create, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .onSuccessTask(result -> resolve(client, result, retries));
    }

    private Task<Snapshot> resolve(SnapshotsClient client, SnapshotsClient.DataOrConflict<Snapshot> result, int retries) {
        if (!result.isConflict()) return Tasks.forResult(result.getData());
        if (retries >= MAX_CONFLICT_RETRIES) return Tasks.forException(new IllegalStateException("Could not resolve the cloud save conflict"));
        SnapshotsClient.SnapshotConflict conflict = result.getConflict();
        Snapshot mine = conflict.getSnapshot();
        Snapshot theirs = conflict.getConflictingSnapshot();
        Snapshot newer = theirs.getMetadata().getLastModifiedTimestamp() > mine.getMetadata().getLastModifiedTimestamp() ? theirs : mine;
        return client.resolveConflict(conflict.getConflictId(), newer).onSuccessTask(next -> resolve(client, next, retries + 1));
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
