import {
  Navigation,
  Form,
  Section,
  Button,
  useState,
  Text,
  VStack,
  Spacer,
  TextField,
  SecureField,
} from "scripting";

// 定义设置结构
type ChinaTelecomSettings = {
  mobile: string;
  password: string;
};

const SETTINGS_KEY = "chinaTelecomSettings";
const VERSION = "1.0.0";

// 默认设置
const defaultSettings: ChinaTelecomSettings = {
  mobile: "",
  password: "",
};

function SettingsPage() {
  const dismiss = Navigation.useDismiss();
  const initialSettings = Storage.get<ChinaTelecomSettings>(SETTINGS_KEY) ?? defaultSettings;

  // State for the form fields
  const [mobile, setMobile] = useState(initialSettings.mobile);
  const [password, setPassword] = useState(initialSettings.password);

  const handleSave = () => {
    const newSettings: ChinaTelecomSettings = {
      mobile: mobile.trim(),
      password: password.trim(),
    };
    
    // 保存设置
    Storage.set(SETTINGS_KEY, newSettings);
    
    dismiss();
  };

  return (
    <VStack>
      <Form>
        <Section title="账号设置">
          <TextField
            title="手机号"
            prompt="请输入11位手机号"
            value={mobile}
            onChanged={setMobile}
          />
          <SecureField
            title="密码"
            prompt="请输入密码"
            value={password}
            onChanged={setPassword}
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" padding={{ top: 4 }}>
            使用官方接口查询数据
          </Text>
        </Section>

        <Button title="保存设置" action={handleSave} />
      </Form>
      <Spacer />
      <VStack alignment="center" spacing={4} padding={{ bottom: 10 }}>
        <Text font="caption2" foregroundStyle="secondaryLabel">
          Version {VERSION}
        </Text>
      </VStack>
    </VStack>
  );
}

Navigation.present(<SettingsPage />);

