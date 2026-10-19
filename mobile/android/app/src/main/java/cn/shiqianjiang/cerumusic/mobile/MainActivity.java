package cn.shiqianjiang.cerumusic.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
