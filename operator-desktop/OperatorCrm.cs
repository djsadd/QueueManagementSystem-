using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace QueueOperatorCrm
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            ServicePointManager.Expect100Continue = false;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new OperatorCrmForm(OperatorConfig.Load()));
        }
    }

    internal sealed class OperatorConfig
    {
        public string ApiBaseUrl = "http://localhost:8000";
        public string DisplayUrl = "http://localhost:5173/ru/admin/operator-display?fullscreen=1";
        public int MonitorIndex = 2;
        public string DisplayMode = "Kiosk";
        public bool FullScreen = false;
        public int RefreshSeconds = 5;
        public string Browser = "Auto";
        public bool RememberEmail = true;

        public static OperatorConfig Load()
        {
            OperatorConfig config = new OperatorConfig();
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "operator.config");

            if (!File.Exists(path))
            {
                return config;
            }

            foreach (string rawLine in File.ReadAllLines(path, Encoding.UTF8))
            {
                string line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#"))
                {
                    continue;
                }

                int separator = line.IndexOf('=');
                if (separator < 1)
                {
                    continue;
                }

                string key = line.Substring(0, separator).Trim();
                string value = line.Substring(separator + 1).Trim();
                int number;
                bool flag;

                if (key.Equals("ApiBaseUrl", StringComparison.OrdinalIgnoreCase))
                {
                    config.ApiBaseUrl = value.TrimEnd('/');
                }
                else if (key.Equals("DisplayUrl", StringComparison.OrdinalIgnoreCase))
                {
                    config.DisplayUrl = value;
                }
                else if (key.Equals("MonitorIndex", StringComparison.OrdinalIgnoreCase) && Int32.TryParse(value, out number))
                {
                    config.MonitorIndex = Math.Max(1, number);
                }
                else if (key.Equals("DisplayMode", StringComparison.OrdinalIgnoreCase))
                {
                    config.DisplayMode = value;
                }
                else if (key.Equals("FullScreen", StringComparison.OrdinalIgnoreCase) && Boolean.TryParse(value, out flag))
                {
                    config.FullScreen = flag;
                }
                else if (key.Equals("RefreshSeconds", StringComparison.OrdinalIgnoreCase) && Int32.TryParse(value, out number))
                {
                    config.RefreshSeconds = Math.Max(2, number);
                }
                else if (key.Equals("Browser", StringComparison.OrdinalIgnoreCase))
                {
                    config.Browser = value;
                }
                else if (key.Equals("RememberEmail", StringComparison.OrdinalIgnoreCase) && Boolean.TryParse(value, out flag))
                {
                    config.RememberEmail = flag;
                }
            }

            return config;
        }
    }

    internal sealed class TokenResponse
    {
        public string access_token { get; set; }
        public string refresh_token { get; set; }
        public string token_type { get; set; }
    }

    internal sealed class UserInfo
    {
        public string id { get; set; }
        public string email { get; set; }
        public string full_name { get; set; }
        public string role { get; set; }
        public bool is_active { get; set; }
    }

    internal sealed class OperatorInfo
    {
        public string id { get; set; }
        public string user_id { get; set; }
        public int? window_id { get; set; }
        public string status { get; set; }
        public string created_at { get; set; }
    }

    internal sealed class ServiceItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string name_kk { get; set; }
        public string name_en { get; set; }
        public string code { get; set; }
        public int priority { get; set; }
        public bool is_active { get; set; }
        public bool requires_educational_program { get; set; }
        public bool requires_reception_desk { get; set; }

        public override string ToString()
        {
            string suffix = String.IsNullOrEmpty(code) ? "" : " (" + code + ")";
            return (name ?? ("Услуга #" + id)) + suffix;
        }
    }

    internal sealed class ProgramItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string name_kk { get; set; }
        public string name_en { get; set; }
        public string code { get; set; }
        public int academic_degree_id { get; set; }
        public bool is_active { get; set; }
        public string created_at { get; set; }

        public override string ToString()
        {
            string suffix = String.IsNullOrEmpty(code) ? "" : " (" + code + ")";
            return (name ?? ("ОП #" + id)) + suffix;
        }
    }

    internal sealed class TicketItem
    {
        public string id { get; set; }
        public string applicant_id { get; set; }
        public int service_id { get; set; }
        public int? educational_program_id { get; set; }
        public string study_language { get; set; }
        public string full_name { get; set; }
        public string iin { get; set; }
        public string phone { get; set; }
        public string service_name { get; set; }
        public string service_name_kk { get; set; }
        public string service_name_en { get; set; }
        public string educational_program_name { get; set; }
        public string educational_program_code { get; set; }
        public string operator_id { get; set; }
        public string operator_name { get; set; }
        public int? window_id { get; set; }
        public string window_name { get; set; }
        public string ticket_number { get; set; }
        public int queue_number { get; set; }
        public int priority { get; set; }
        public string status { get; set; }
        public int? estimated_wait { get; set; }
        public string created_at { get; set; }
        public string called_at { get; set; }
        public string started_at { get; set; }
        public string completed_at { get; set; }
    }

    internal sealed class MyWindowTickets
    {
        public string operator_id { get; set; }
        public string operator_status { get; set; }
        public int window_id { get; set; }
        public string window_name { get; set; }
        public string window_status { get; set; }
        public int global_waiting_count { get; set; }
        public int page { get; set; }
        public int page_size { get; set; }
        public int total { get; set; }
        public int total_pages { get; set; }
        public List<TicketItem> tickets { get; set; }
    }

    internal sealed class ApiClient
    {
        private readonly string baseUrl;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
        private string accessToken;
        private string refreshToken;

        public ApiClient(string baseUrl)
        {
            this.baseUrl = baseUrl.TrimEnd('/');
        }

        public bool HasToken
        {
            get { return !String.IsNullOrEmpty(accessToken); }
        }

        public void ClearToken()
        {
            accessToken = null;
            refreshToken = null;
        }

        public TokenResponse Login(string email, string password)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["email"] = email;
            body["password"] = password;
            TokenResponse tokens = serializer.Deserialize<TokenResponse>(Request("POST", "/auth/login", serializer.Serialize(body), false));
            accessToken = tokens.access_token;
            refreshToken = tokens.refresh_token;
            return tokens;
        }

        public UserInfo Me()
        {
            return serializer.Deserialize<UserInfo>(Request("GET", "/auth/me", null, true));
        }

        public OperatorInfo MyOperator()
        {
            return serializer.Deserialize<OperatorInfo>(Request("GET", "/operators/me", null, true));
        }

        public MyWindowTickets MyWindow()
        {
            MyWindowTickets data = serializer.Deserialize<MyWindowTickets>(Request("GET", "/tickets/my-window?page_size=50", null, true));
            if (data.tickets == null)
            {
                data.tickets = new List<TicketItem>();
            }
            return data;
        }

        public MyWindowTickets UpdateOperatorStatus(string status)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["status"] = status;
            return serializer.Deserialize<MyWindowTickets>(Request("PATCH", "/tickets/my-window/status", serializer.Serialize(body), true));
        }

        public MyWindowTickets UpdateWindowStatus(string status)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["status"] = status;
            return serializer.Deserialize<MyWindowTickets>(Request("PATCH", "/tickets/my-window/window-status", serializer.Serialize(body), true));
        }

        public TicketItem CallNext()
        {
            return serializer.Deserialize<TicketItem>(Request("PATCH", "/tickets/my-window/next", null, true));
        }

        public TicketItem AcceptTicket(string ticketId)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["iin"] = null;
            return serializer.Deserialize<TicketItem>(Request("PATCH", "/tickets/my-window/" + ticketId + "/accept", serializer.Serialize(body), true));
        }

        public TicketItem CompleteTicket(string ticketId)
        {
            return serializer.Deserialize<TicketItem>(Request("PATCH", "/tickets/my-window/" + ticketId + "/complete", null, true));
        }

        public TicketItem SkipTicket(string ticketId)
        {
            return serializer.Deserialize<TicketItem>(Request("PATCH", "/tickets/my-window/" + ticketId + "/skip", null, true));
        }

        public TicketItem DeclineTicket(string ticketId)
        {
            return serializer.Deserialize<TicketItem>(Request("PATCH", "/tickets/my-window/" + ticketId + "/decline", null, true));
        }

        public List<ServiceItem> AvailableServices()
        {
            return serializer.Deserialize<List<ServiceItem>>(Request("GET", "/operators/me/available-services", null, true));
        }

        public List<ServiceItem> MyServices()
        {
            return serializer.Deserialize<List<ServiceItem>>(Request("GET", "/operators/me/services", null, true));
        }

        public List<ServiceItem> SaveMyServices(List<int> ids)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["service_ids"] = ids;
            return serializer.Deserialize<List<ServiceItem>>(Request("PUT", "/operators/me/services", serializer.Serialize(body), true));
        }

        public List<ProgramItem> AvailablePrograms()
        {
            return serializer.Deserialize<List<ProgramItem>>(Request("GET", "/operators/me/available-educational-programs", null, true));
        }

        public List<ProgramItem> MyPrograms()
        {
            return serializer.Deserialize<List<ProgramItem>>(Request("GET", "/operators/me/educational-programs", null, true));
        }

        public List<ProgramItem> SaveMyPrograms(List<int> ids)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["educational_program_ids"] = ids;
            return serializer.Deserialize<List<ProgramItem>>(Request("PUT", "/operators/me/educational-programs", serializer.Serialize(body), true));
        }

        private string Request(string method, string path, string body, bool auth)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(baseUrl + path);
            request.Method = method;
            request.Accept = "application/json";
            request.ContentType = "application/json; charset=utf-8";
            request.Timeout = 15000;
            request.ReadWriteTimeout = 15000;

            if (auth && !String.IsNullOrEmpty(accessToken))
            {
                request.Headers[HttpRequestHeader.Authorization] = "Bearer " + accessToken;
            }

            if (body != null)
            {
                byte[] data = Encoding.UTF8.GetBytes(body);
                request.ContentLength = data.Length;
                using (Stream stream = request.GetRequestStream())
                {
                    stream.Write(data, 0, data.Length);
                }
            }

            try
            {
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    return reader.ReadToEnd();
                }
            }
            catch (WebException exception)
            {
                HttpWebResponse response = exception.Response as HttpWebResponse;
                if (response == null)
                {
                    throw new ApplicationException("Нет связи с сервером: " + exception.Message);
                }

                using (response)
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    string details = reader.ReadToEnd();
                    throw new ApplicationException("Ошибка сервера (" + (int)response.StatusCode + "): " + details);
                }
            }
        }
    }

    internal sealed class DisplayLauncher
    {
        private readonly OperatorConfig config;

        public DisplayLauncher(OperatorConfig config)
        {
            this.config = config;
        }

        public void Launch()
        {
            string browserPath = FindBrowser();
            if (String.IsNullOrEmpty(browserPath))
            {
                throw new ApplicationException("Microsoft Edge или Google Chrome не найден.");
            }

            Screen targetScreen = GetTargetScreen();
            Rectangle bounds = targetScreen.Bounds;
            string profilePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QueueOperatorDisplay", "BrowserProfile");
            Directory.CreateDirectory(profilePath);

            List<string> args = new List<string>();
            args.Add("--new-window");
            args.Add("--no-first-run");
            args.Add("--disable-session-crashed-bubble");
            args.Add("--window-position=" + bounds.X + "," + bounds.Y);
            args.Add("--window-size=" + bounds.Width + "," + bounds.Height);
            args.Add("--user-data-dir=\"" + profilePath + "\"");

            if (config.DisplayMode.Equals("Kiosk", StringComparison.OrdinalIgnoreCase))
            {
                args.Add("--kiosk");
                args.Add("--edge-kiosk-type=fullscreen");
            }
            else
            {
                args.Add("--start-fullscreen");
            }

            args.Add("\"" + config.DisplayUrl + "\"");
            Process.Start(browserPath, String.Join(" ", args.ToArray()));
        }

        private Screen GetTargetScreen()
        {
            Screen[] screens = Screen.AllScreens;
            if (screens.Length == 0)
            {
                return Screen.PrimaryScreen;
            }

            Screen[] ordered = screens
                .OrderBy(delegate(Screen screen) { return screen.Primary ? 0 : 1; })
                .ThenBy(delegate(Screen screen) { return screen.Bounds.X; })
                .ThenBy(delegate(Screen screen) { return screen.Bounds.Y; })
                .ToArray();

            if (config.MonitorIndex >= 1 && config.MonitorIndex <= ordered.Length)
            {
                return ordered[config.MonitorIndex - 1];
            }

            foreach (Screen screen in ordered)
            {
                if (!screen.Primary)
                {
                    return screen;
                }
            }

            return Screen.PrimaryScreen;
        }

        private string FindBrowser()
        {
            List<string> candidates = new List<string>();
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string x86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? programFiles;

            if (config.Browser.Equals("Auto", StringComparison.OrdinalIgnoreCase) || config.Browser.Equals("Edge", StringComparison.OrdinalIgnoreCase))
            {
                candidates.Add(Path.Combine(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"));
                candidates.Add(Path.Combine(x86, "Microsoft\\Edge\\Application\\msedge.exe"));
                candidates.Add(Path.Combine(localAppData, "Microsoft\\Edge\\Application\\msedge.exe"));
            }

            if (config.Browser.Equals("Auto", StringComparison.OrdinalIgnoreCase) || config.Browser.Equals("Chrome", StringComparison.OrdinalIgnoreCase))
            {
                candidates.Add(Path.Combine(programFiles, "Google\\Chrome\\Application\\chrome.exe"));
                candidates.Add(Path.Combine(x86, "Google\\Chrome\\Application\\chrome.exe"));
                candidates.Add(Path.Combine(localAppData, "Google\\Chrome\\Application\\chrome.exe"));
            }

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }

            return null;
        }
    }

    internal sealed class OperatorCrmForm : Form
    {
        private readonly OperatorConfig config;
        private readonly ApiClient api;
        private readonly DisplayLauncher displayLauncher;
        private readonly System.Windows.Forms.Timer refreshTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer clockTimer = new System.Windows.Forms.Timer();
        private readonly Panel loginPanel = new Panel();
        private readonly Panel shellPanel = new Panel();
        private readonly Panel contentPanel = new Panel();
        private readonly Label statusLabel = new Label();
        private readonly Label timeLabel = new Label();
        private readonly Label userLabel = new Label();
        private readonly TextBox emailBox = new TextBox();
        private readonly TextBox passwordBox = new TextBox();
        private readonly DataGridView ticketsGrid = new DataGridView();
        private readonly Label totalTicketsValue = new Label();
        private readonly Label windowValue = new Label();
        private readonly Label currentTicketValue = new Label();
        private readonly Label queueValue = new Label();
        private readonly Label operatorStatusValue = new Label();
        private readonly Label windowStatusValue = new Label();
        private readonly Label statusBanner = new Label();
        private readonly Label footerStatusLabel = new Label();
        private readonly Button nextButton = new Button();
        private readonly Button acceptButton = new Button();
        private readonly Button completeButton = new Button();
        private readonly Button skipButton = new Button();
        private readonly Button declineButton = new Button();
        private readonly CheckedListBox servicesList = new CheckedListBox();
        private readonly CheckedListBox programsList = new CheckedListBox();
        private UserInfo currentUser;
        private MyWindowTickets myWindowData;
        private bool loading;
        private bool windowActionsWired;
        private string currentView = "window";

        public OperatorCrmForm(OperatorConfig config)
        {
            this.config = config;
            api = new ApiClient(config.ApiBaseUrl);
            displayLauncher = new DisplayLauncher(config);
            InitializeWindow();
            InitializeLogin();
            InitializeShell();
            ShowLogin();
            clockTimer.Interval = 1000;
            clockTimer.Tick += delegate { timeLabel.Text = DateTime.Now.ToString("HH:mm"); };
            clockTimer.Start();
            refreshTimer.Interval = Math.Max(2, config.RefreshSeconds) * 1000;
            refreshTimer.Tick += delegate { if (currentView == "window") LoadMyWindowAsync(false); };
        }

        private void InitializeWindow()
        {
            Text = "Queue Operator CRM";
            BackColor = Color.FromArgb(250, 248, 249);
            Font = new Font("Segoe UI", 10F, FontStyle.Regular);
            MinimumSize = new Size(1100, 720);
            StartPosition = FormStartPosition.CenterScreen;

            if (config.FullScreen)
            {
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
            }
        }

        private void InitializeLogin()
        {
            loginPanel.Dock = DockStyle.Fill;
            loginPanel.BackColor = Color.FromArgb(238, 242, 246);
            Controls.Add(loginPanel);

            Panel card = CreateCard();
            card.Width = 430;
            card.Height = 430;
            card.Anchor = AnchorStyles.None;
            card.Location = new Point((ClientSize.Width - card.Width) / 2, (ClientSize.Height - card.Height) / 2);
            card.Resize += delegate { };
            loginPanel.Resize += delegate
            {
                card.Location = new Point((loginPanel.ClientSize.Width - card.Width) / 2, (loginPanel.ClientSize.Height - card.Height) / 2);
            };
            loginPanel.Controls.Add(card);

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(30);
            layout.ColumnCount = 1;
            layout.RowCount = 8;
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 70F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            card.Controls.Add(layout);

            PictureBox logo = new PictureBox();
            logo.Dock = DockStyle.Fill;
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            LoadLogo(logo);
            layout.Controls.Add(logo, 0, 0);

            Label title = new Label();
            title.Dock = DockStyle.Fill;
            title.Text = "CRM оператора";
            title.Font = new Font("Segoe UI", 24F, FontStyle.Bold);
            title.ForeColor = Color.FromArgb(17, 24, 39);
            title.TextAlign = ContentAlignment.MiddleCenter;
            layout.Controls.Add(title, 0, 1);

            layout.Controls.Add(CreateSmallLabel("Email"), 0, 2);
            emailBox.Dock = DockStyle.Fill;
            emailBox.Font = new Font("Segoe UI", 13F);
            emailBox.Text = LoadSavedEmail();
            layout.Controls.Add(emailBox, 0, 3);

            layout.Controls.Add(CreateSmallLabel("Пароль"), 0, 4);
            passwordBox.Dock = DockStyle.Fill;
            passwordBox.Font = new Font("Segoe UI", 13F);
            passwordBox.PasswordChar = '●';
            passwordBox.KeyDown += delegate(object sender, KeyEventArgs args)
            {
                if (args.KeyCode == Keys.Enter)
                {
                    LoginAsync();
                }
            };
            layout.Controls.Add(passwordBox, 0, 5);

            Button loginButton = CreatePrimaryButton("Войти");
            loginButton.Dock = DockStyle.Fill;
            loginButton.Click += delegate { LoginAsync(); };
            layout.Controls.Add(loginButton, 0, 6);

            statusLabel.Dock = DockStyle.Fill;
            statusLabel.ForeColor = Color.FromArgb(154, 0, 45);
            statusLabel.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            statusLabel.TextAlign = ContentAlignment.TopCenter;
            layout.Controls.Add(statusLabel, 0, 7);
        }

        private void InitializeShell()
        {
            shellPanel.Dock = DockStyle.Fill;
            shellPanel.Visible = false;
            shellPanel.BackColor = Color.FromArgb(250, 248, 249);
            Controls.Add(shellPanel);

            TableLayoutPanel shell = new TableLayoutPanel();
            shell.Dock = DockStyle.Fill;
            shell.ColumnCount = 2;
            shell.RowCount = 1;
            shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88F));
            shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            shellPanel.Controls.Add(shell);

            Panel side = new Panel();
            side.Dock = DockStyle.Fill;
            side.BackColor = Color.White;
            side.Padding = new Padding(12, 28, 12, 18);
            shell.Controls.Add(side, 0, 0);

            TableLayoutPanel nav = new TableLayoutPanel();
            nav.Dock = DockStyle.Fill;
            nav.ColumnCount = 1;
            nav.RowCount = 10;
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 78F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            nav.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 64F));
            nav.RowStyles.Add(new RowStyle(SizeType.Absolute, 64F));
            side.Controls.Add(nav);

            Button collapseButton = CreateRailButton("▹", "Меню");
            nav.Controls.Add(collapseButton, 0, 0);

            Button windowButton = CreateRailButton("▣", "Мое окно");
            windowButton.Click += delegate { ShowWindowView(); };
            nav.Controls.Add(windowButton, 0, 1);

            Button profileButton = CreateRailButton("☷", "Профиль, услуги и ОП");
            profileButton.Click += delegate { ShowProfileView(); };
            nav.Controls.Add(profileButton, 0, 2);

            Button displayButton = CreateRailButton("▭", "Второй экран");
            displayButton.ForeColor = Color.FromArgb(15, 118, 110);
            displayButton.Click += delegate { LaunchDisplay(); };
            nav.Controls.Add(displayButton, 0, 3);

            nav.Controls.Add(CreateRailButton("◉", "Очередь"), 0, 4);
            nav.Controls.Add(CreateRailButton("▤", "История"), 0, 5);
            nav.Controls.Add(CreateRailButton("↺", "Обновить"), 0, 6);

            Button refreshButton = CreateRailButton("⟳", "Обновить");
            refreshButton.Dock = DockStyle.Fill;
            refreshButton.Click += delegate
            {
                if (currentView == "profile")
                {
                    LoadProfileAsync();
                }
                else
                {
                    LoadMyWindowAsync(true);
                }
            };
            nav.Controls.Add(refreshButton, 0, 8);

            Button logoutButton = CreateRailButton("Б", "Выйти");
            logoutButton.Dock = DockStyle.Fill;
            logoutButton.Click += delegate { Logout(); };
            nav.Controls.Add(logoutButton, 0, 9);

            TableLayoutPanel main = new TableLayoutPanel();
            main.Dock = DockStyle.Fill;
            main.Padding = new Padding(32, 30, 32, 18);
            main.RowCount = 3;
            main.ColumnCount = 1;
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 82F));
            main.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            main.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            shell.Controls.Add(main, 1, 0);

            TableLayoutPanel header = new TableLayoutPanel();
            header.Dock = DockStyle.Fill;
            header.ColumnCount = 2;
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230F));
            main.Controls.Add(header, 0, 0);

            userLabel.Dock = DockStyle.Fill;
            userLabel.Font = new Font("Segoe UI", 24F, FontStyle.Bold);
            userLabel.ForeColor = Color.FromArgb(17, 24, 39);
            userLabel.TextAlign = ContentAlignment.MiddleLeft;
            header.Controls.Add(userLabel, 0, 0);

            TableLayoutPanel languageSwitch = new TableLayoutPanel();
            languageSwitch.Dock = DockStyle.Fill;
            languageSwitch.Margin = new Padding(0, 4, 0, 10);
            languageSwitch.ColumnCount = 3;
            languageSwitch.RowCount = 1;
            languageSwitch.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            languageSwitch.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            languageSwitch.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34F));
            languageSwitch.Controls.Add(CreateLanguageButton("RU", true), 0, 0);
            languageSwitch.Controls.Add(CreateLanguageButton("KK", false), 1, 0);
            languageSwitch.Controls.Add(CreateLanguageButton("EN", false), 2, 0);
            header.Controls.Add(languageSwitch, 1, 0);

            contentPanel.Dock = DockStyle.Fill;
            main.Controls.Add(contentPanel, 0, 1);

            Label footer = new Label();
            footerStatusLabel.Dock = DockStyle.Fill;
            footerStatusLabel.ForeColor = Color.FromArgb(100, 116, 139);
            footerStatusLabel.Text = config.ApiBaseUrl + "  ·  " + DateTime.Now.ToString("HH:mm");
            footerStatusLabel.TextAlign = ContentAlignment.MiddleLeft;
            main.Controls.Add(footerStatusLabel, 0, 2);
        }

        private void ShowLogin()
        {
            refreshTimer.Stop();
            loginPanel.Visible = true;
            shellPanel.Visible = false;
            emailBox.Focus();
        }

        private void ShowShell()
        {
            loginPanel.Visible = false;
            shellPanel.Visible = true;
            userLabel.Text = currentUser.full_name + "  ·  " + currentUser.email;
            ShowWindowView();
            refreshTimer.Start();
        }

        private void LoginAsync()
        {
            string email = emailBox.Text.Trim();
            string password = passwordBox.Text;
            if (email.Length == 0 || password.Length == 0)
            {
                statusLabel.Text = "Введите email и пароль.";
                return;
            }

            SetLoginBusy(true, "Вход...");
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    api.Login(email, password);
                    currentUser = api.Me();
                    api.MyOperator();
                    if (config.RememberEmail)
                    {
                        SaveEmail(email);
                    }

                    OnUi(delegate
                    {
                        passwordBox.Text = "";
                        SetLoginBusy(false, "");
                        ShowShell();
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate { SetLoginBusy(false, exception.Message); });
                }
            });
        }

        private void ShowWindowView()
        {
            currentView = "window";
            userLabel.Text = "Мое окно";
            contentPanel.Controls.Clear();

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.RowCount = 4;
            layout.ColumnCount = 1;
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 160F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 76F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            contentPanel.Controls.Add(layout);

            TableLayoutPanel cards = new TableLayoutPanel();
            cards.Dock = DockStyle.Fill;
            cards.ColumnCount = 3;
            cards.RowCount = 1;
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230F));
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 230F));
            cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.Controls.Add(cards, 0, 0);

            cards.Controls.Add(CreateMetricCard("Талонов всего", totalTicketsValue, "▣"), 0, 0);
            cards.Controls.Add(CreateMetricCard("Человек в очереди", queueValue, "☷"), 1, 0);

            TableLayoutPanel actions = new TableLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.ColumnCount = 10;
            actions.RowCount = 1;
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 210F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130F));
            actions.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130F));
            layout.Controls.Add(actions, 0, 1);

            nextButton.Text = "Следующий";
            ConfigureActionButton(nextButton, Color.FromArgb(154, 0, 45), Color.White);
            actions.Controls.Add(nextButton, 0, 0);

            Panel realtimeBadge = CreateRealtimeBadge();
            actions.Controls.Add(realtimeBadge, 1, 0);

            acceptButton.Text = "Принять";
            ConfigureActionButton(acceptButton, Color.FromArgb(15, 118, 110), Color.White);
            actions.Controls.Add(acceptButton, 2, 0);

            completeButton.Text = "Завершить";
            ConfigureActionButton(completeButton, Color.FromArgb(37, 99, 235), Color.White);
            actions.Controls.Add(completeButton, 3, 0);

            skipButton.Text = "Не явился";
            ConfigureActionButton(skipButton, Color.FromArgb(180, 83, 9), Color.White);
            actions.Controls.Add(skipButton, 4, 0);

            declineButton.Text = "Отказать";
            ConfigureActionButton(declineButton, Color.FromArgb(190, 18, 60), Color.White);
            actions.Controls.Add(declineButton, 5, 0);

            if (!windowActionsWired)
            {
                nextButton.Click += delegate { RunTicketAction("Вызов следующего...", delegate { api.CallNext(); }); };
                acceptButton.Click += delegate { RunSelectedTicketAction("WAITING", "Принятие талона...", delegate(string id) { api.AcceptTicket(id); }); };
                completeButton.Click += delegate { RunSelectedTicketAction("CALLED", "Завершение...", delegate(string id) { api.CompleteTicket(id); }); };
                skipButton.Click += delegate { RunSelectedTicketAction("CALLED", "Пропуск талона...", delegate(string id) { api.SkipTicket(id); }); };
                declineButton.Click += delegate { RunSelectedTicketAction("WAITING", "Отказ талона...", delegate(string id) { api.DeclineTicket(id); }); };
                windowActionsWired = true;
            }

            Button openButton = CreateSecondaryButton("Открыто");
            openButton.Dock = DockStyle.Fill;
            openButton.Click += delegate { RunTicketAction("Смена статуса окна...", delegate { api.UpdateWindowStatus("OPEN"); }); };
            actions.Controls.Add(openButton, 7, 0);

            Button busyButton = CreateSecondaryButton("Занято");
            busyButton.Dock = DockStyle.Fill;
            busyButton.Click += delegate { RunTicketAction("Смена статуса окна...", delegate { api.UpdateWindowStatus("BUSY"); }); };
            actions.Controls.Add(busyButton, 8, 0);

            Button closedButton = CreateSecondaryButton("Закрыто");
            closedButton.Dock = DockStyle.Fill;
            closedButton.Click += delegate { RunTicketAction("Смена статуса окна...", delegate { api.UpdateWindowStatus("CLOSED"); }); };
            actions.Controls.Add(closedButton, 9, 0);

            statusBanner.Dock = DockStyle.Fill;
            statusBanner.Margin = new Padding(0, 0, 0, 0);
            statusBanner.Padding = new Padding(18, 0, 0, 0);
            statusBanner.BackColor = Color.FromArgb(236, 253, 243);
            statusBanner.ForeColor = Color.FromArgb(4, 120, 87);
            statusBanner.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            statusBanner.TextAlign = ContentAlignment.MiddleLeft;
            layout.Controls.Add(statusBanner, 0, 2);

            ConfigureTicketsGrid();
            layout.Controls.Add(ticketsGrid, 0, 3);
            LoadMyWindowAsync(true);
        }

        private void ShowProfileView()
        {
            currentView = "profile";
            userLabel.Text = "Профиль";
            contentPanel.Controls.Clear();

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 2;
            layout.RowCount = 2;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 78F));
            contentPanel.Controls.Add(layout);

            Panel servicesCard = CreateCard();
            servicesCard.Margin = new Padding(0, 0, 12, 0);
            Panel programsCard = CreateCard();
            programsCard.Margin = new Padding(12, 0, 0, 0);
            layout.Controls.Add(servicesCard, 0, 0);
            layout.Controls.Add(programsCard, 1, 0);

            BuildChecklistCard(servicesCard, "Услуги оператора", servicesList);
            BuildChecklistCard(programsCard, "Образовательные программы", programsList);

            FlowLayoutPanel actions = new FlowLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.FlowDirection = FlowDirection.RightToLeft;
            actions.Padding = new Padding(0, 16, 0, 0);
            layout.Controls.Add(actions, 0, 1);
            layout.SetColumnSpan(actions, 2);

            Button savePrograms = CreatePrimaryButton("Сохранить ОП");
            savePrograms.Width = 170;
            savePrograms.Click += delegate { SaveProgramsAsync(); };
            actions.Controls.Add(savePrograms);

            Button saveServices = CreatePrimaryButton("Сохранить услуги");
            saveServices.Width = 190;
            saveServices.Click += delegate { SaveServicesAsync(); };
            actions.Controls.Add(saveServices);

            LoadProfileAsync();
        }

        private void LoadMyWindowAsync(bool showStatus)
        {
            if (loading || !api.HasToken)
            {
                return;
            }

            loading = true;
            if (showStatus)
            {
                SetFooterStatus("Загрузка окна...");
            }

            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    MyWindowTickets data = api.MyWindow();
                    OnUi(delegate
                    {
                        myWindowData = data;
                        RenderWindowData();
                        SetFooterStatus("Обновлено: " + DateTime.Now.ToString("HH:mm:ss"));
                        loading = false;
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate
                    {
                        SetFooterStatus(exception.Message);
                        loading = false;
                    });
                }
            });
        }

        private void LoadProfileAsync()
        {
            if (loading)
            {
                return;
            }

            loading = true;
            SetFooterStatus("Загрузка профиля...");
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    List<ServiceItem> availableServices = api.AvailableServices();
                    List<ServiceItem> myServices = api.MyServices();
                    List<ProgramItem> availablePrograms = api.AvailablePrograms();
                    List<ProgramItem> myPrograms = api.MyPrograms();

                    OnUi(delegate
                    {
                        FillServiceChecklist(availableServices, myServices);
                        FillProgramChecklist(availablePrograms, myPrograms);
                        SetFooterStatus("Профиль загружен.");
                        loading = false;
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate
                    {
                        SetFooterStatus(exception.Message);
                        loading = false;
                    });
                }
            });
        }

        private void RenderWindowData()
        {
            if (myWindowData == null)
            {
                return;
            }

            List<TicketItem> tickets = myWindowData.tickets ?? new List<TicketItem>();
            TicketItem current = tickets.FirstOrDefault(delegate(TicketItem ticket) { return ticket.status == "CALLED" && ticket.window_id == myWindowData.window_id; });

            windowValue.Text = !String.IsNullOrEmpty(myWindowData.window_name) ? myWindowData.window_name : "Окно #" + myWindowData.window_id;
            totalTicketsValue.Text = myWindowData.total.ToString();
            currentTicketValue.Text = current == null ? "-" : current.ticket_number;
            queueValue.Text = myWindowData.global_waiting_count.ToString();
            operatorStatusValue.Text = LabelOperatorStatus(myWindowData.operator_status);
            windowStatusValue.Text = LabelWindowStatus(myWindowData.window_status);
            statusBanner.Text = "Статус окна: " + LabelWindowStatus(myWindowData.window_status)
                + "   ·   " + windowValue.Text
                + "   ·   Оператор: " + LabelOperatorStatus(myWindowData.operator_status);

            ticketsGrid.Rows.Clear();
            foreach (TicketItem ticket in tickets.OrderBy(delegate(TicketItem item) { return TicketSortOrder(item.status); }).ThenBy(delegate(TicketItem item) { return ParseDate(item.created_at); }))
            {
                if (ticket.status != "WAITING" && ticket.status != "CALLED")
                {
                    continue;
                }

                int rowIndex = ticketsGrid.Rows.Add(
                    ticket.ticket_number,
                    ticket.service_name ?? ("Услуга #" + ticket.service_id),
                    String.IsNullOrEmpty(ticket.educational_program_name) ? "-" : ticket.educational_program_name,
                    LabelTicketStatus(ticket.status),
                    FormatWait(ticket.created_at));
                DataGridViewRow row = ticketsGrid.Rows[rowIndex];
                row.Tag = ticket;
                if (ticket.status == "CALLED")
                {
                    row.DefaultCellStyle.BackColor = Color.FromArgb(255, 251, 235);
                }
                else
                {
                    row.DefaultCellStyle.BackColor = Color.FromArgb(255, 241, 242);
                }
            }
        }

        private void ConfigureTicketsGrid()
        {
            ticketsGrid.Dock = DockStyle.Fill;
            ticketsGrid.AllowUserToAddRows = false;
            ticketsGrid.AllowUserToDeleteRows = false;
            ticketsGrid.ReadOnly = true;
            ticketsGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            ticketsGrid.MultiSelect = false;
            ticketsGrid.RowHeadersVisible = false;
            ticketsGrid.BackgroundColor = Color.White;
            ticketsGrid.BorderStyle = BorderStyle.None;
            ticketsGrid.GridColor = Color.FromArgb(230, 233, 238);
            ticketsGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            ticketsGrid.ColumnHeadersHeight = 54;
            ticketsGrid.RowTemplate.Height = 78;
            ticketsGrid.Font = new Font("Segoe UI", 11F);
            ticketsGrid.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            ticketsGrid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(251, 252, 253);
            ticketsGrid.ColumnHeadersDefaultCellStyle.ForeColor = Color.FromArgb(117, 129, 149);
            ticketsGrid.ColumnHeadersDefaultCellStyle.SelectionBackColor = Color.FromArgb(251, 252, 253);
            ticketsGrid.EnableHeadersVisualStyles = false;
            ticketsGrid.DefaultCellStyle.ForeColor = Color.FromArgb(16, 24, 40);
            ticketsGrid.DefaultCellStyle.SelectionBackColor = Color.FromArgb(245, 230, 235);
            ticketsGrid.DefaultCellStyle.SelectionForeColor = Color.FromArgb(16, 24, 40);

            if (ticketsGrid.Columns.Count == 0)
            {
                ticketsGrid.Columns.Add("ticket", "Талон");
                ticketsGrid.Columns.Add("service", "Услуга");
                ticketsGrid.Columns.Add("program", "ОП");
                ticketsGrid.Columns.Add("status", "Статус");
                ticketsGrid.Columns.Add("wait", "Ожидание");
                ticketsGrid.Columns[0].FillWeight = 70;
                ticketsGrid.Columns[1].FillWeight = 170;
                ticketsGrid.Columns[2].FillWeight = 160;
                ticketsGrid.Columns[3].FillWeight = 90;
                ticketsGrid.Columns[4].FillWeight = 80;
            }
        }

        private void BuildChecklistCard(Panel card, string title, CheckedListBox list)
        {
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(22);
            layout.RowCount = 2;
            layout.ColumnCount = 1;
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            card.Controls.Add(layout);

            Label label = new Label();
            label.Dock = DockStyle.Fill;
            label.Text = title;
            label.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            label.ForeColor = Color.FromArgb(17, 24, 39);
            layout.Controls.Add(label, 0, 0);

            list.Dock = DockStyle.Fill;
            list.CheckOnClick = true;
            list.BorderStyle = BorderStyle.None;
            list.Font = new Font("Segoe UI", 12F);
            layout.Controls.Add(list, 0, 1);
        }

        private void FillServiceChecklist(List<ServiceItem> available, List<ServiceItem> selected)
        {
            Dictionary<int, bool> selectedMap = new Dictionary<int, bool>();
            foreach (ServiceItem item in selected ?? new List<ServiceItem>())
            {
                selectedMap[item.id] = true;
            }

            servicesList.Items.Clear();
            foreach (ServiceItem item in (available ?? new List<ServiceItem>()).Where(delegate(ServiceItem service) { return service.is_active; }))
            {
                int index = servicesList.Items.Add(item);
                servicesList.SetItemChecked(index, selectedMap.ContainsKey(item.id));
            }
        }

        private void FillProgramChecklist(List<ProgramItem> available, List<ProgramItem> selected)
        {
            Dictionary<int, bool> selectedMap = new Dictionary<int, bool>();
            foreach (ProgramItem item in selected ?? new List<ProgramItem>())
            {
                selectedMap[item.id] = true;
            }

            programsList.Items.Clear();
            foreach (ProgramItem item in (available ?? new List<ProgramItem>()).Where(delegate(ProgramItem program) { return program.is_active; }))
            {
                int index = programsList.Items.Add(item);
                programsList.SetItemChecked(index, selectedMap.ContainsKey(item.id));
            }
        }

        private void SaveServicesAsync()
        {
            List<int> ids = new List<int>();
            foreach (object checkedItem in servicesList.CheckedItems)
            {
                ServiceItem service = checkedItem as ServiceItem;
                if (service != null)
                {
                    ids.Add(service.id);
                }
            }

            RunProfileSave("Сохранение услуг...", delegate { api.SaveMyServices(ids); });
        }

        private void SaveProgramsAsync()
        {
            List<int> ids = new List<int>();
            foreach (object checkedItem in programsList.CheckedItems)
            {
                ProgramItem program = checkedItem as ProgramItem;
                if (program != null)
                {
                    ids.Add(program.id);
                }
            }

            RunProfileSave("Сохранение ОП...", delegate { api.SaveMyPrograms(ids); });
        }

        private void RunProfileSave(string message, Action action)
        {
            if (loading)
            {
                return;
            }

            loading = true;
            SetFooterStatus(message);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    action();
                    OnUi(delegate
                    {
                        loading = false;
                        SetFooterStatus("Сохранено.");
                        LoadProfileAsync();
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate
                    {
                        loading = false;
                        SetFooterStatus(exception.Message);
                    });
                }
            });
        }

        private void RunTicketAction(string message, Action action)
        {
            if (loading)
            {
                return;
            }

            loading = true;
            SetFooterStatus(message);
            SetActionButtons(false);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    action();
                    MyWindowTickets data = api.MyWindow();
                    OnUi(delegate
                    {
                        myWindowData = data;
                        RenderWindowData();
                        SetFooterStatus("Готово.");
                        SetActionButtons(true);
                        loading = false;
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate
                    {
                        SetFooterStatus(exception.Message);
                        SetActionButtons(true);
                        loading = false;
                    });
                }
            });
        }

        private delegate void TicketAction(string id);

        private void RunSelectedTicketAction(string requiredStatus, string message, TicketAction action)
        {
            TicketItem ticket = GetSelectedTicket();
            if (ticket == null)
            {
                SetFooterStatus("Выберите талон в таблице.");
                return;
            }

            if (ticket.status != requiredStatus)
            {
                SetFooterStatus("Для этого действия нужен статус: " + LabelTicketStatus(requiredStatus));
                return;
            }

            RunTicketAction(message, delegate { action(ticket.id); });
        }

        private TicketItem GetSelectedTicket()
        {
            if (ticketsGrid.SelectedRows.Count == 0)
            {
                return null;
            }

            return ticketsGrid.SelectedRows[0].Tag as TicketItem;
        }

        private void LaunchDisplay()
        {
            try
            {
                displayLauncher.Launch();
                SetFooterStatus("Второй экран запущен.");
            }
            catch (Exception exception)
            {
                SetFooterStatus(exception.Message);
            }
        }

        private void Logout()
        {
            api.ClearToken();
            currentUser = null;
            myWindowData = null;
            ShowLogin();
        }

        private Panel CreateCard()
        {
            Panel panel = new Panel();
            panel.Dock = DockStyle.Fill;
            panel.BackColor = Color.White;
            panel.Padding = new Padding(0);
            panel.Paint += delegate(object sender, PaintEventArgs args)
            {
                Control control = (Control)sender;
                using (Pen pen = new Pen(Color.FromArgb(219, 227, 238)))
                {
                    args.Graphics.DrawRectangle(pen, 0, 0, control.Width - 1, control.Height - 1);
                }
            };
            return panel;
        }

        private Panel CreateMetricCard(string title, Label value, string icon)
        {
            Panel card = CreateCard();
            card.Margin = new Padding(0, 0, 14, 20);

            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(18, 16, 16, 14);
            layout.RowCount = 3;
            layout.ColumnCount = 2;
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 56F));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            card.Controls.Add(layout);

            Label iconLabel = new Label();
            iconLabel.Dock = DockStyle.Fill;
            iconLabel.Text = icon;
            iconLabel.BackColor = Color.FromArgb(245, 230, 235);
            iconLabel.ForeColor = Color.FromArgb(154, 0, 45);
            iconLabel.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            iconLabel.TextAlign = ContentAlignment.MiddleCenter;
            layout.Controls.Add(iconLabel, 0, 0);

            Label liveLabel = new Label();
            liveLabel.Dock = DockStyle.Fill;
            liveLabel.Text = "LIVE";
            liveLabel.ForeColor = Color.FromArgb(154, 0, 45);
            liveLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            liveLabel.TextAlign = ContentAlignment.MiddleRight;
            layout.Controls.Add(liveLabel, 1, 0);

            Label titleLabel = new Label();
            titleLabel.Dock = DockStyle.Fill;
            titleLabel.Text = title;
            titleLabel.ForeColor = Color.FromArgb(100, 116, 139);
            titleLabel.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            titleLabel.TextAlign = ContentAlignment.MiddleLeft;
            layout.Controls.Add(titleLabel, 0, 2);
            layout.SetColumnSpan(titleLabel, 2);

            value.Dock = DockStyle.Fill;
            value.Text = "-";
            value.ForeColor = Color.FromArgb(17, 24, 39);
            value.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
            value.TextAlign = ContentAlignment.MiddleLeft;
            layout.Controls.Add(value, 0, 1);
            layout.SetColumnSpan(value, 2);
            return card;
        }

        private Button CreatePrimaryButton(string text)
        {
            Button button = new Button();
            button.Text = text;
            ConfigureActionButton(button, Color.FromArgb(154, 0, 45), Color.White);
            return button;
        }

        private Button CreateSecondaryButton(string text)
        {
            Button button = new Button();
            ConfigureActionButton(button, Color.White, Color.FromArgb(52, 64, 84));
            button.FlatAppearance.BorderColor = Color.FromArgb(216, 222, 232);
            button.FlatAppearance.BorderSize = 1;
            return button;
        }

        private Button CreateRailButton(string text, string tooltip)
        {
            Button button = new Button();
            button.Dock = DockStyle.Fill;
            button.Text = text;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderColor = Color.FromArgb(225, 229, 235);
            button.FlatAppearance.BorderSize = 1;
            button.BackColor = Color.White;
            button.ForeColor = Color.FromArgb(52, 64, 84);
            button.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
            button.Margin = new Padding(10, 0, 10, 14);
            button.Cursor = Cursors.Hand;
            ToolTip tip = new ToolTip();
            tip.SetToolTip(button, tooltip);
            return button;
        }

        private Button CreateLanguageButton(string text, bool selected)
        {
            Button button = new Button();
            button.Dock = DockStyle.Fill;
            button.Text = text;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = selected ? Color.FromArgb(154, 0, 45) : Color.White;
            button.ForeColor = selected ? Color.White : Color.FromArgb(17, 24, 39);
            button.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            button.Margin = new Padding(0, 0, 8, 0);
            button.Cursor = Cursors.Hand;
            return button;
        }

        private Panel CreateRealtimeBadge()
        {
            Panel panel = new Panel();
            panel.Dock = DockStyle.Fill;
            panel.Margin = new Padding(0, 0, 10, 14);
            panel.BackColor = Color.FromArgb(250, 248, 249);

            Label dot = new Label();
            dot.Text = "●";
            dot.ForeColor = Color.FromArgb(15, 118, 110);
            dot.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            dot.Location = new Point(0, 18);
            dot.Size = new Size(26, 26);
            panel.Controls.Add(dot);

            Label text = new Label();
            text.Text = "В реальном времени";
            text.ForeColor = Color.FromArgb(100, 116, 139);
            text.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            text.Location = new Point(28, 21);
            text.Size = new Size(178, 24);
            panel.Controls.Add(text);
            return panel;
        }

        private Button CreateNavButton(string text)
        {
            Button button = CreateSecondaryButton(text);
            button.Dock = DockStyle.Fill;
            button.TextAlign = ContentAlignment.MiddleLeft;
            button.Padding = new Padding(16, 0, 0, 0);
            button.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            return button;
        }

        private void ConfigureActionButton(Button button, Color backColor, Color foreColor)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = backColor;
            button.ForeColor = foreColor;
            button.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            button.Margin = new Padding(0, 0, 10, 14);
            button.Cursor = Cursors.Hand;
        }

        private Label CreateSmallLabel(string text)
        {
            Label label = new Label();
            label.Dock = DockStyle.Fill;
            label.Text = text;
            label.ForeColor = Color.FromArgb(100, 116, 139);
            label.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            label.TextAlign = ContentAlignment.BottomLeft;
            return label;
        }

        private void LoadLogo(PictureBox box)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.png");
            if (File.Exists(path))
            {
                box.Image = Image.FromFile(path);
            }
        }

        private void SetLoginBusy(bool busy, string message)
        {
            emailBox.Enabled = !busy;
            passwordBox.Enabled = !busy;
            statusLabel.Text = message;
            UseWaitCursor = busy;
        }

        private void SetActionButtons(bool enabled)
        {
            nextButton.Enabled = enabled;
            acceptButton.Enabled = enabled;
            completeButton.Enabled = enabled;
            skipButton.Enabled = enabled;
            declineButton.Enabled = enabled;
        }

        private void SetFooterStatus(string message)
        {
            Text = "Queue Operator CRM";
            if (footerStatusLabel != null)
            {
                string clock = DateTime.Now.ToString("HH:mm");
                footerStatusLabel.Text = (String.IsNullOrEmpty(message) ? config.ApiBaseUrl : message)
                    + "  ·  " + clock;
            }
        }

        private void OnUi(MethodInvoker operation)
        {
            if (!IsDisposed)
            {
                BeginInvoke(operation);
            }
        }

        private string LabelOperatorStatus(string status)
        {
            if (status == "ONLINE") return "Готов";
            if (status == "BUSY") return "Занят";
            if (status == "BREAK") return "Отошел";
            if (status == "OFFLINE") return "Не работает";
            return status ?? "-";
        }

        private string LabelWindowStatus(string status)
        {
            if (status == "OPEN") return "Открыто";
            if (status == "BUSY") return "Занято";
            if (status == "CLOSED") return "Закрыто";
            return status ?? "-";
        }

        private string LabelTicketStatus(string status)
        {
            if (status == "WAITING") return "Ожидает";
            if (status == "CALLED") return "Вызван";
            if (status == "COMPLETED") return "Завершен";
            if (status == "SKIPPED") return "Не явился";
            if (status == "CANCELLED") return "Отменен";
            return status ?? "-";
        }

        private int TicketSortOrder(string status)
        {
            if (status == "CALLED") return 0;
            if (status == "WAITING") return 1;
            return 2;
        }

        private DateTime ParseDate(string value)
        {
            DateTime result;
            if (DateTime.TryParse(value, out result))
            {
                return result;
            }

            return DateTime.MinValue;
        }

        private string FormatWait(string createdAt)
        {
            DateTime created = ParseDate(createdAt);
            if (created == DateTime.MinValue)
            {
                return "-";
            }

            TimeSpan wait = DateTime.Now - created.ToLocalTime();
            if (wait.TotalMinutes < 1)
            {
                return "меньше минуты";
            }

            return Math.Max(1, (int)wait.TotalMinutes) + " мин";
        }

        private string SettingsPath()
        {
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QueueOperatorCrm");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "settings.txt");
        }

        private string LoadSavedEmail()
        {
            try
            {
                string path = SettingsPath();
                return File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8).Trim() : "";
            }
            catch
            {
                return "";
            }
        }

        private void SaveEmail(string email)
        {
            try
            {
                File.WriteAllText(SettingsPath(), email ?? "", Encoding.UTF8);
            }
            catch
            {
            }
        }
    }
}
