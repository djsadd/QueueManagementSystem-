using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace QueueTerminal
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            ServicePointManager.Expect100Continue = false;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TerminalForm(TerminalConfig.Load()));
        }
    }

    internal sealed class TerminalConfig
    {
        public string ApiBaseUrl = "http://192.168.115.12:8000";
        public string PrinterName = "";
        public bool FullScreen = true;
        public int ReceiptWidthMm = 80;
        public int ReceiptBottomFeedMm = 5;

        public static TerminalConfig Load()
        {
            TerminalConfig config = new TerminalConfig();
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "terminal.config");

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
                else if (key.Equals("PrinterName", StringComparison.OrdinalIgnoreCase))
                {
                    config.PrinterName = value;
                }
                else if (key.Equals("FullScreen", StringComparison.OrdinalIgnoreCase) && Boolean.TryParse(value, out flag))
                {
                    config.FullScreen = flag;
                }
                else if (key.Equals("ReceiptWidthMm", StringComparison.OrdinalIgnoreCase) && Int32.TryParse(value, out number))
                {
                    config.ReceiptWidthMm = Math.Max(40, number);
                }
                else if (key.Equals("ReceiptBottomFeedMm", StringComparison.OrdinalIgnoreCase) && Int32.TryParse(value, out number))
                {
                    config.ReceiptBottomFeedMm = Math.Max(0, number);
                }
            }

            return config;
        }
    }

    internal sealed class ServiceItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string name_kk { get; set; }
        public string name_en { get; set; }
        public string code { get; set; }
        public string display_name { get; set; }
        public int priority { get; set; }
        public bool is_active { get; set; }
        public bool requires_educational_program { get; set; }

        public override string ToString()
        {
            return display_name ?? name ?? code ?? id.ToString();
        }
    }

    internal sealed class ProgramItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string name_kk { get; set; }
        public string name_en { get; set; }
        public string code { get; set; }
        public bool is_active { get; set; }
        public string display_name { get; set; }

        public override string ToString()
        {
            return display_name ?? name ?? id.ToString();
        }
    }

    internal sealed class TicketItem
    {
        public string id { get; set; }
        public int service_id { get; set; }
        public int? educational_program_id { get; set; }
        public string service_name { get; set; }
        public string service_name_kk { get; set; }
        public string service_name_en { get; set; }
        public string educational_program_name { get; set; }
        public string educational_program_name_kk { get; set; }
        public string educational_program_name_en { get; set; }
        public string ticket_number { get; set; }
        public string created_at { get; set; }
    }

    internal sealed class ApiClient
    {
        private readonly string baseUrl;
        private readonly JavaScriptSerializer serializer = new JavaScriptSerializer();

        public ApiClient(string baseUrl)
        {
            this.baseUrl = baseUrl.TrimEnd('/');
        }

        public List<ServiceItem> GetServices()
        {
            return serializer.Deserialize<List<ServiceItem>>(Request("GET", "/public/services", null));
        }

        public List<ProgramItem> GetPrograms()
        {
            return serializer.Deserialize<List<ProgramItem>>(Request("GET", "/public/educational-programs", null));
        }

        public TicketItem CreateTicket(int serviceId, int? programId)
        {
            Dictionary<string, object> body = new Dictionary<string, object>();
            body["service_id"] = serviceId;
            body["educational_program_id"] = programId.HasValue ? (object)programId.Value : null;
            string json = serializer.Serialize(body);
            return serializer.Deserialize<TicketItem>(Request("POST", "/public/tickets", json));
        }

        private string Request(string method, string path, string body)
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(baseUrl + path);
            request.Method = method;
            request.Accept = "application/json";
            request.ContentType = "application/json; charset=utf-8";
            request.Headers["X-Queue-Client"] = "desktop-terminal";
            request.Timeout = 15000;
            request.ReadWriteTimeout = 15000;

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

    internal sealed class TerminalForm : Form
    {
        private const int ChoiceCardWidth = 250;
        private const int ChoiceCardHeight = 112;

        private enum UiLanguage
        {
            Kazakh,
            Russian,
            English
        }

        private readonly TerminalConfig config;
        private readonly ApiClient api;
        private readonly PictureBox logo = new PictureBox();
        private readonly Label heading = new Label();
        private readonly Label timeLabel = new Label();
        private readonly Button kazakhButton = new Button();
        private readonly Button russianButton = new Button();
        private readonly Button englishButton = new Button();
        private readonly Label formTitle = new Label();
        private readonly Label serviceLabel = new Label();
        private readonly Button serviceSelector = new Button();
        private readonly Button programSelector = new Button();
        private readonly Label programLabel = new Label();
        private readonly Button issueButton = new Button();
        private readonly Button reloadButton = new Button();
        private readonly Button reprintButton = new Button();
        private readonly Label statusLabel = new Label();
        private readonly Label resultLabel = new Label();
        private readonly Label ticketNumber = new Label();
        private readonly Label ticketDetails = new Label();
        private readonly System.Windows.Forms.Timer clockTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer ticketDisplayTimer = new System.Windows.Forms.Timer();
        private TableLayoutPanel ticketFormLayout;
        private List<ServiceItem> serviceCatalog = new List<ServiceItem>();
        private List<ProgramItem> programCatalog = new List<ProgramItem>();
        private ServiceItem selectedService;
        private ProgramItem selectedProgram;
        private UiLanguage language = UiLanguage.Russian;
        private TicketItem lastTicket;
        private bool busy;

        public TerminalForm(TerminalConfig config)
        {
            this.config = config;
            api = new ApiClient(config.ApiBaseUrl);
            InitializeWindow();
            InitializeLayout();
            ApplyLanguage();
            clockTimer.Interval = 1000;
            clockTimer.Tick += delegate { UpdateClock(); };
            clockTimer.Start();
            ticketDisplayTimer.Interval = 10000;
            ticketDisplayTimer.Tick += delegate { ClearDisplayedTicket(); };
            UpdateClock();
            Shown += delegate { LoadCatalogs(); };
        }

        private void InitializeWindow()
        {
            BackColor = Color.FromArgb(250, 247, 248);
            Font = new Font("Segoe UI", 12F, FontStyle.Regular);
            MinimumSize = new Size(760, 560);
            StartPosition = FormStartPosition.CenterScreen;

            if (config.FullScreen)
            {
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
                TopMost = true;
            }
        }

        private void InitializeLayout()
        {
            TableLayoutPanel outer = new TableLayoutPanel();
            outer.Dock = DockStyle.Fill;
            outer.Padding = new Padding(36);
            outer.ColumnCount = 2;
            outer.RowCount = 2;
            outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60F));
            outer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40F));
            outer.RowStyles.Add(new RowStyle(SizeType.Absolute, 125F));
            outer.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            Controls.Add(outer);

            TableLayoutPanel header = new TableLayoutPanel();
            header.Dock = DockStyle.Fill;
            header.ColumnCount = 3;
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120F));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 335F));
            outer.Controls.Add(header, 0, 0);
            outer.SetColumnSpan(header, 2);

            logo.Dock = DockStyle.Fill;
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            logo.Margin = new Padding(0, 0, 18, 0);
            LoadLogo();
            header.Controls.Add(logo, 0, 0);

            heading.Font = new Font("Segoe UI", 25F, FontStyle.Bold);
            heading.ForeColor = Color.FromArgb(93, 15, 37);
            heading.AutoSize = true;
            heading.Dock = DockStyle.Fill;
            heading.TextAlign = ContentAlignment.MiddleLeft;
            header.Controls.Add(heading, 1, 0);

            TableLayoutPanel headerActions = new TableLayoutPanel();
            headerActions.Dock = DockStyle.Fill;
            headerActions.RowCount = 2;
            headerActions.ColumnCount = 3;
            headerActions.RowStyles.Add(new RowStyle(SizeType.Absolute, 56F));
            headerActions.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            headerActions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            headerActions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33F));
            headerActions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.34F));
            header.Controls.Add(headerActions, 2, 0);

            timeLabel.Dock = DockStyle.Fill;
            timeLabel.Font = new Font("Segoe UI", 17F, FontStyle.Bold);
            timeLabel.ForeColor = Color.FromArgb(93, 15, 37);
            timeLabel.TextAlign = ContentAlignment.MiddleRight;
            headerActions.Controls.Add(timeLabel, 0, 0);
            headerActions.SetColumnSpan(timeLabel, 3);
            ConfigureLanguageButton(kazakhButton, UiLanguage.Kazakh);
            ConfigureLanguageButton(russianButton, UiLanguage.Russian);
            ConfigureLanguageButton(englishButton, UiLanguage.English);
            headerActions.Controls.Add(kazakhButton, 0, 1);
            headerActions.Controls.Add(russianButton, 1, 1);
            headerActions.Controls.Add(englishButton, 2, 1);

            Panel formCard = CreateCard();
            Panel resultCard = CreateCard();
            outer.Controls.Add(formCard, 0, 1);
            outer.Controls.Add(resultCard, 1, 1);
            formCard.Margin = new Padding(0, 16, 16, 0);
            resultCard.Margin = new Padding(16, 16, 0, 0);

            ticketFormLayout = new TableLayoutPanel();
            ticketFormLayout.Dock = DockStyle.Fill;
            ticketFormLayout.Padding = new Padding(30);
            ticketFormLayout.ColumnCount = 1;
            ticketFormLayout.RowCount = 8;
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 96F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 96F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 75F));
            ticketFormLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 72F));
            formCard.Controls.Add(ticketFormLayout);

            formTitle.Dock = DockStyle.Fill;
            formTitle.Font = new Font("Segoe UI", 22F, FontStyle.Bold);
            formTitle.ForeColor = Color.FromArgb(40, 21, 26);
            ticketFormLayout.Controls.Add(formTitle, 0, 0);
            serviceLabel.Dock = DockStyle.Fill;
            serviceLabel.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            ticketFormLayout.Controls.Add(serviceLabel, 0, 1);
            ConfigureSelectorButton(serviceSelector, delegate { OpenServiceDialog(); });
            ticketFormLayout.Controls.Add(serviceSelector, 0, 2);

            programLabel.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            programLabel.Dock = DockStyle.Fill;
            ticketFormLayout.Controls.Add(programLabel, 0, 3);
            ConfigureSelectorButton(programSelector, delegate { OpenProgramDialog(); });
            ticketFormLayout.Controls.Add(programSelector, 0, 4);

            issueButton.Dock = DockStyle.Fill;
            issueButton.FlatStyle = FlatStyle.Flat;
            issueButton.FlatAppearance.BorderSize = 0;
            issueButton.BackColor = Color.FromArgb(122, 22, 49);
            issueButton.ForeColor = Color.White;
            issueButton.Font = new Font("Segoe UI", 19F, FontStyle.Bold);
            issueButton.Click += delegate { CreateTicket(); };
            ticketFormLayout.Controls.Add(issueButton, 0, 6);

            statusLabel.Dock = DockStyle.Fill;
            statusLabel.ForeColor = Color.FromArgb(122, 22, 49);
            statusLabel.Padding = new Padding(0, 16, 0, 0);
            statusLabel.AutoSize = true;
            ticketFormLayout.Controls.Add(statusLabel, 0, 7);

            TableLayoutPanel result = new TableLayoutPanel();
            result.Dock = DockStyle.Fill;
            result.Padding = new Padding(26);
            result.ColumnCount = 1;
            result.RowCount = 7;
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 36F));
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 100F));
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 90F));
            result.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 12F));
            result.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            resultCard.Controls.Add(result);

            resultLabel.Dock = DockStyle.Fill;
            resultLabel.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            resultLabel.ForeColor = Color.FromArgb(40, 21, 26);
            result.Controls.Add(resultLabel, 0, 0);
            ticketNumber.Text = "---";
            ticketNumber.Dock = DockStyle.Fill;
            ticketNumber.Font = new Font("Segoe UI", 44F, FontStyle.Bold);
            ticketNumber.ForeColor = Color.FromArgb(93, 15, 37);
            ticketNumber.TextAlign = ContentAlignment.MiddleCenter;
            result.Controls.Add(ticketNumber, 0, 1);

            ticketDetails.Dock = DockStyle.Fill;
            ticketDetails.TextAlign = ContentAlignment.TopCenter;
            result.Controls.Add(ticketDetails, 0, 2);

            reprintButton.Dock = DockStyle.Fill;
            reprintButton.Enabled = false;
            reprintButton.Click += delegate { PrintLastTicket(); };
            result.Controls.Add(reprintButton, 0, 4);

            reloadButton.Dock = DockStyle.Fill;
            reloadButton.Click += delegate { LoadCatalogs(); };
            result.Controls.Add(reloadButton, 0, 6);
        }

        private void LoadLogo()
        {
            string logoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.png");
            if (!File.Exists(logoPath))
            {
                return;
            }

            using (Image source = Image.FromFile(logoPath))
            {
                logo.Image = new Bitmap(source);
            }
        }

        private void ConfigureLanguageButton(Button button, UiLanguage selectedLanguage)
        {
            button.Dock = DockStyle.Fill;
            button.Margin = new Padding(3);
            button.FlatStyle = FlatStyle.Flat;
            button.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            button.Click += delegate
            {
                language = selectedLanguage;
                ApplyLanguage();
            };
        }

        private Panel CreateCard()
        {
            Panel panel = new Panel();
            panel.Dock = DockStyle.Fill;
            panel.BackColor = Color.White;
            panel.BorderStyle = BorderStyle.FixedSingle;
            return panel;
        }

        private Label NewLabel(string text, float size, FontStyle style)
        {
            Label label = new Label();
            label.Text = text;
            label.Dock = DockStyle.Fill;
            label.Font = new Font("Segoe UI", size, style);
            label.ForeColor = Color.FromArgb(40, 21, 26);
            return label;
        }

        private void ConfigureChoicePanel(FlowLayoutPanel panel)
        {
            panel.Dock = DockStyle.Fill;
            panel.AutoScroll = true;
            panel.BackColor = Color.White;
            panel.BorderStyle = BorderStyle.FixedSingle;
            panel.FlowDirection = FlowDirection.LeftToRight;
            panel.WrapContents = true;
            panel.Padding = new Padding(10);
            panel.Resize += delegate { ResizeChoiceButtons(panel); };
        }

        private void ConfigureSelectorButton(Button button, EventHandler onClick)
        {
            button.Dock = DockStyle.Fill;
            button.AutoEllipsis = true;
            button.FlatStyle = FlatStyle.Flat;
            button.Font = new Font("Segoe UI", 16F, FontStyle.Bold);
            button.Margin = new Padding(0, 0, 0, 12);
            button.Padding = new Padding(18, 0, 18, 0);
            button.TextAlign = ContentAlignment.MiddleLeft;
            button.UseVisualStyleBackColor = false;
            button.Click += onClick;
            StyleChoiceButton(button, false);
        }

        private Button CreateChoiceButton(string text, bool selected, EventHandler onClick)
        {
            Button button = new Button();
            button.AutoEllipsis = true;
            button.FlatStyle = FlatStyle.Flat;
            button.Font = new Font("Segoe UI", 13F, FontStyle.Bold);
            button.Margin = new Padding(8);
            button.Padding = new Padding(14);
            button.Size = new Size(ChoiceCardWidth, ChoiceCardHeight);
            button.Text = text;
            button.TextAlign = ContentAlignment.MiddleCenter;
            button.UseVisualStyleBackColor = false;
            button.Click += onClick;
            StyleChoiceButton(button, selected);
            return button;
        }

        private void StyleChoiceButton(Button button, bool selected)
        {
            button.FlatAppearance.BorderSize = selected ? 2 : 1;
            button.FlatAppearance.BorderColor = selected ? Color.FromArgb(122, 22, 49) : Color.FromArgb(234, 212, 218);
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(252, 239, 243);
            button.FlatAppearance.MouseDownBackColor = Color.FromArgb(247, 219, 227);
            button.BackColor = selected ? Color.FromArgb(247, 219, 227) : Color.White;
            button.ForeColor = selected ? Color.FromArgb(93, 15, 37) : Color.FromArgb(40, 21, 26);
        }

        private void ResizeChoiceButtons(FlowLayoutPanel panel)
        {
            int maxWidth = Math.Max(180, panel.ClientSize.Width - panel.Padding.Horizontal - 24);
            int cardWidth = Math.Min(ChoiceCardWidth, maxWidth);

            foreach (Control control in panel.Controls)
            {
                Button button = control as Button;
                if (button != null)
                {
                    button.Size = new Size(cardWidth, ChoiceCardHeight);
                    continue;
                }

                control.Width = maxWidth;
            }
        }

        private void ApplyLanguage()
        {
            Text = T("Талон беру терминалы", "Терминал выдачи талонов", "Ticket terminal");
            heading.Text = T("Электрондық кезек\r\nТалон алу", "Электронная очередь\r\nПолучение талона", "Digital queue\r\nGet a ticket");
            formTitle.Text = T("Қызметті таңдаңыз", "Выберите услугу", "Select a service");
            serviceLabel.Text = T("Қызмет", "Услуга", "Service");
            programLabel.Text = T("Білім беру бағдарламасы", "Образовательная программа", "Educational program");
            issueButton.Text = T("ТАЛОН АЛУ", "ПОЛУЧИТЬ ТАЛОН", "GET TICKET");
            resultLabel.Text = T("СІЗДІҢ ТАЛОНЫҢЫЗ", "ВАШ ТАЛОН", "YOUR TICKET");
            reprintButton.Text = T("Қайта басып шығару", "Повторить печать", "Print again");
            reloadButton.Text = T("Қызметтерді жаңарту", "Обновить список услуг", "Reload services");
            kazakhButton.Text = "Қазақша";
            russianButton.Text = "Русский";
            englishButton.Text = "English";
            StyleLanguageButton(kazakhButton, language == UiLanguage.Kazakh);
            StyleLanguageButton(russianButton, language == UiLanguage.Russian);
            StyleLanguageButton(englishButton, language == UiLanguage.English);
            RefreshCatalogLanguage();

            if (lastTicket == null)
            {
                ticketDetails.Text = T(
                    "Тіркелгеннен кейін талон\r\nавтоматты түрде басып шығарылады.",
                    "После регистрации номер\r\nбудет распечатан автоматически.",
                    "The registered ticket\r\nwill print automatically.");
            }
            else
            {
                ticketDetails.Text = BuildTicketDetails(lastTicket);
            }
        }

        private void StyleLanguageButton(Button button, bool selected)
        {
            button.FlatAppearance.BorderColor = Color.FromArgb(122, 22, 49);
            button.BackColor = selected ? Color.FromArgb(122, 22, 49) : Color.White;
            button.ForeColor = selected ? Color.White : Color.FromArgb(93, 15, 37);
        }

        private string T(string kazakh, string russian, string english)
        {
            if (language == UiLanguage.Kazakh)
            {
                return kazakh;
            }
            return language == UiLanguage.English ? english : russian;
        }

        private void UpdateClock()
        {
            timeLabel.Text = DateTime.Now.ToString("dd.MM.yyyy  HH:mm:ss");
        }

        private void RefreshCatalogLanguage()
        {
            foreach (ServiceItem item in serviceCatalog)
            {
                item.display_name = LocalizedValue(item.name_kk, item.name, item.name_en);
            }

            foreach (ProgramItem item in programCatalog)
            {
                item.display_name = LocalizedValue(item.name_kk, item.name, item.name_en);
            }

            RenderServiceChoices();
            RenderProgramChoices();
            SetProgramVisibility();
        }

        private void RenderServiceChoices()
        {
            serviceSelector.Text = selectedService != null
                ? selectedService.ToString()
                : T("Қызметті таңдау үшін басыңыз", "Нажмите, чтобы выбрать услугу", "Tap to select a service");
            serviceSelector.Enabled = !busy && serviceCatalog.Count > 0;
            StyleChoiceButton(serviceSelector, selectedService != null);
        }

        private void RenderProgramChoices()
        {
            programSelector.Text = selectedProgram != null
                ? selectedProgram.ToString()
                : T("ОП таңдау үшін басыңыз", "Нажмите, чтобы выбрать ОП", "Tap to select a program");
            programSelector.Enabled = !busy && programCatalog.Count > 0;
            StyleChoiceButton(programSelector, selectedProgram != null);
        }

        private void OpenServiceDialog()
        {
            ServiceItem service = ShowChoiceDialog<ServiceItem>(
                serviceCatalog,
                selectedService,
                T("Қызметті таңдаңыз", "Выберите услугу", "Select a service"),
                T("Қолжетімді қызметтер жоқ.", "Нет доступных услуг.", "No services available."));

            if (service == null)
            {
                return;
            }

            selectedService = service;
            if (!selectedService.requires_educational_program)
            {
                selectedProgram = null;
            }
            else if (selectedProgram == null && programCatalog.Count > 0)
            {
                selectedProgram = programCatalog[0];
            }

            RenderServiceChoices();
            RenderProgramChoices();
            SetProgramVisibility();
        }

        private void OpenProgramDialog()
        {
            if (selectedService == null || !selectedService.requires_educational_program)
            {
                return;
            }

            ProgramItem program = ShowChoiceDialog<ProgramItem>(
                programCatalog,
                selectedProgram,
                T("Білім беру бағдарламасын таңдаңыз", "Выберите ОП", "Select a program"),
                T("Қолжетімді ОП жоқ.", "Нет доступных ОП.", "No programs available."));

            if (program != null)
            {
                selectedProgram = program;
                RenderProgramChoices();
            }
        }

        private TItem ShowChoiceDialog<TItem>(IList<TItem> items, TItem selectedItem, string title, string emptyMessage)
            where TItem : class
        {
            TItem result = null;

            using (Form dialog = new Form())
            {
                dialog.Text = title;
                dialog.BackColor = Color.White;
                dialog.StartPosition = FormStartPosition.CenterParent;
                dialog.FormBorderStyle = FormBorderStyle.FixedDialog;
                dialog.MinimizeBox = false;
                dialog.MaximizeBox = false;
                dialog.ShowInTaskbar = false;
                dialog.TopMost = config.FullScreen;
                dialog.ClientSize = new Size(
                    Math.Max(620, Math.Min(900, ClientSize.Width - 120)),
                    Math.Max(520, Math.Min(720, ClientSize.Height - 120)));

                TableLayoutPanel layout = new TableLayoutPanel();
                layout.Dock = DockStyle.Fill;
                layout.Padding = new Padding(24);
                layout.RowCount = 3;
                layout.ColumnCount = 1;
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58F));
                layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
                layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 68F));
                dialog.Controls.Add(layout);

                Label titleLabel = NewLabel(title, 22F, FontStyle.Bold);
                titleLabel.TextAlign = ContentAlignment.MiddleLeft;
                layout.Controls.Add(titleLabel, 0, 0);

                FlowLayoutPanel choices = new FlowLayoutPanel();
                ConfigureChoicePanel(choices);
                choices.Margin = new Padding(0, 0, 0, 16);
                layout.Controls.Add(choices, 0, 1);

                if (items.Count == 0)
                {
                    Label emptyLabel = NewLabel(emptyMessage, 15F, FontStyle.Regular);
                    emptyLabel.TextAlign = ContentAlignment.MiddleCenter;
                    choices.Controls.Add(emptyLabel);
                }

                foreach (TItem item in items)
                {
                    TItem choice = item;
                    Button button = CreateChoiceButton(choice.ToString(), Object.Equals(choice, selectedItem), delegate
                    {
                        result = choice;
                        dialog.DialogResult = DialogResult.OK;
                        dialog.Close();
                    });
                    choices.Controls.Add(button);
                }

                ResizeChoiceButtons(choices);

                Button cancelButton = new Button();
                cancelButton.Dock = DockStyle.Fill;
                cancelButton.FlatStyle = FlatStyle.Flat;
                cancelButton.FlatAppearance.BorderSize = 1;
                cancelButton.FlatAppearance.BorderColor = Color.FromArgb(234, 212, 218);
                cancelButton.BackColor = Color.White;
                cancelButton.ForeColor = Color.FromArgb(93, 15, 37);
                cancelButton.Font = new Font("Segoe UI", 15F, FontStyle.Bold);
                cancelButton.Text = T("Жабу", "Закрыть", "Close");
                cancelButton.UseVisualStyleBackColor = false;
                cancelButton.Click += delegate { dialog.Close(); };
                layout.Controls.Add(cancelButton, 0, 2);

                dialog.ShowDialog(this);
            }

            return result;
        }

        private void LoadCatalogs()
        {
            SetBusy(true, T("Қызметтер жүктелуде...", "Загрузка списка услуг...", "Loading services..."));
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    List<ServiceItem> serviceList = api.GetServices();
                    List<ProgramItem> programList = api.GetPrograms();
                    serviceList.RemoveAll(delegate(ServiceItem item) { return !item.is_active; });
                    programList.RemoveAll(delegate(ProgramItem item) { return !item.is_active; });
                    serviceList.Sort(delegate(ServiceItem left, ServiceItem right)
                    {
                        int priority = right.priority.CompareTo(left.priority);
                        return priority != 0 ? priority : String.Compare(left.name, right.name, StringComparison.CurrentCulture);
                    });
                    programList.Sort(delegate(ProgramItem left, ProgramItem right)
                    {
                        return String.Compare(left.name, right.name, StringComparison.CurrentCulture);
                    });
                    OnUi(delegate
                    {
                        serviceCatalog = serviceList;
                        programCatalog = programList;
                        selectedService = serviceCatalog.Count > 0 ? serviceCatalog[0] : null;
                        selectedProgram = programCatalog.Count > 0 ? programCatalog[0] : null;
                        RefreshCatalogLanguage();
                        SetProgramVisibility();
                        SetBusy(false, serviceList.Count == 0
                            ? T("Қолжетімді қызметтер жоқ.", "Нет доступных услуг.", "No services available.")
                            : "");
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate { SetBusy(false, exception.Message); });
                }
            });
        }

        private void SetProgramVisibility()
        {
            bool required = selectedService != null && selectedService.requires_educational_program;
            programLabel.Visible = required;
            programSelector.Visible = required;

            if (ticketFormLayout != null)
            {
                ticketFormLayout.RowStyles[2].Height = 96F;
                ticketFormLayout.RowStyles[3].Height = required ? 34F : 0F;
                ticketFormLayout.RowStyles[4].Height = required ? 96F : 0F;
            }
        }

        private void CreateTicket()
        {
            if (selectedService == null)
            {
                statusLabel.Text = T("Қызметті таңдаңыз.", "Выберите услугу.", "Select a service.");
                return;
            }

            if (selectedService.requires_educational_program && selectedProgram == null)
            {
                statusLabel.Text = T(
                    "Білім беру бағдарламасын таңдаңыз.",
                    "Выберите образовательную программу.",
                    "Select an educational program.");
                return;
            }

            int? programId = selectedService.requires_educational_program ? (int?)selectedProgram.id : null;
            SetBusy(true, T("Талон тіркелуде...", "Регистрация талона...", "Registering ticket..."));
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    TicketItem ticket = api.CreateTicket(selectedService.id, programId);
                    OnUi(delegate
                    {
                        lastTicket = ticket;
                        ticketNumber.Text = ticket.ticket_number;
                        ticketDetails.Text = BuildTicketDetails(ticket);
                        reprintButton.Enabled = true;
                        ticketDisplayTimer.Stop();
                        ticketDisplayTimer.Start();
                        SetBusy(false, T("Талон тіркелді. Басып шығару...", "Талон зарегистрирован. Печать...", "Ticket registered. Printing..."));
                        PrintLastTicket();
                    });
                }
                catch (Exception exception)
                {
                    OnUi(delegate { SetBusy(false, exception.Message); });
                }
            });
        }

        private void PrintLastTicket()
        {
            if (lastTicket == null)
            {
                return;
            }

            try
            {
                using (PrintDocument document = new PrintDocument())
                {
                    if (!String.IsNullOrEmpty(config.PrinterName))
                    {
                        document.PrinterSettings.PrinterName = config.PrinterName;
                        if (!document.PrinterSettings.IsValid)
                        {
                            throw new ApplicationException(T("Принтер табылмады: ", "Принтер не найден: ", "Printer not found: ") + config.PrinterName);
                        }
                    }

                    document.PrintController = new StandardPrintController();
                    document.DocumentName = "Ticket " + lastTicket.ticket_number;
                    document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
                    document.DefaultPageSettings.PaperSize = new PaperSize(
                        "Receipt",
                        MmToHundredthsInch(config.ReceiptWidthMm),
                        GetReceiptHeight());
                    document.PrintPage += DrawReceipt;
                    document.Print();
                    statusLabel.Text = T("Талон ", "Талон ", "Ticket ") + lastTicket.ticket_number
                        + T(" басып шығаруға жіберілді.", " отправлен на печать.", " sent to printer.");
                }
            }
            catch (Exception exception)
            {
                statusLabel.Text = T(
                    "Талон жасалды, бірақ басып шығару орындалмады: ",
                    "Талон создан, но печать не выполнена: ",
                    "Ticket created, but printing failed: ") + exception.Message;
            }
        }

        private void ClearDisplayedTicket()
        {
            ticketDisplayTimer.Stop();
            lastTicket = null;
            ticketNumber.Text = "---";
            reprintButton.Enabled = false;
            statusLabel.Text = "";
            ApplyLanguage();
        }

        private int GetReceiptHeight()
        {
            float height = 304F;
            int width = MmToHundredthsInch(config.ReceiptWidthMm) - 74;

            using (Bitmap bitmap = new Bitmap(1, 1))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            using (Font value = new Font("Arial", 13F, FontStyle.Bold))
            using (Font small = new Font("Arial", 11F, FontStyle.Regular))
            {
                graphics.PageUnit = GraphicsUnit.Display;
                height += graphics.MeasureString(BuildServiceName(lastTicket), value, width).Height + 8F;
                if (!String.IsNullOrEmpty(lastTicket.educational_program_name))
                {
                    height += 7F + graphics.MeasureString(BuildProgramName(lastTicket), small, width).Height + 8F;
                }
            }

            height += MmToHundredthsInch(config.ReceiptBottomFeedMm);
            return (int)Math.Ceiling(height);
        }

        private void DrawReceipt(object sender, PrintPageEventArgs args)
        {
            Graphics graphics = args.Graphics;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

            RectangleF bounds = new RectangleF(
                args.MarginBounds.Left,
                args.MarginBounds.Top,
                args.MarginBounds.Width,
                args.MarginBounds.Height);
            RectangleF frame = bounds;
            RectangleF content = new RectangleF(bounds.Left + 34F, bounds.Top, bounds.Width - 68F, bounds.Height);
            StringFormat center = new StringFormat();
            center.Alignment = StringAlignment.Center;
            float y = bounds.Top + 2F;

            using (Pen framePen = new Pen(Color.Black, 1.4F))
            using (Pen thinPen = new Pen(Color.Black, 0.9F))
            using (Pen dividerPen = new Pen(Color.Black, 1.2F))
            using (Font organization = new Font("Arial", 31F, FontStyle.Bold))
            using (Font label = new Font("Arial", 13F, FontStyle.Regular))
            using (Font service = new Font("Arial", 13F, FontStyle.Bold))
            using (Font program = new Font("Arial", 11F, FontStyle.Regular))
            using (Font date = new Font("Arial", 12F, FontStyle.Regular))
            using (Font number = CreateFittedFont(graphics, lastTicket.ticket_number, "Arial", 43F, FontStyle.Bold, content.Width))
            {
                DrawReceiptFrame(graphics, framePen, thinPen, frame);
                if (!DrawReceiptLogo(graphics, content, y, 62F))
                {
                    graphics.DrawString("TAU", organization, Brushes.Black, new RectangleF(content.Left, y, content.Width, 62F), center);
                }
                y += 68F;
                y += 20F;
                graphics.DrawString(T("Сіздің талоныңыз", "Ваш талон", "Your ticket"), label, Brushes.Black, new RectangleF(content.Left, y, content.Width, 24F), center);
                y += 26F;
                graphics.DrawString(lastTicket.ticket_number, number, Brushes.Black, new RectangleF(content.Left, y, content.Width, 62F), center);
                y += 70F;
                y += 24F;
                DrawCenteredWrapped(graphics, BuildServiceName(lastTicket), service, content, ref y);

                if (!String.IsNullOrEmpty(lastTicket.educational_program_name))
                {
                    y += 7F;
                    DrawCenteredWrapped(graphics, BuildProgramName(lastTicket), program, content, ref y);
                }

                y += 16F;
                DrawOrnamentalDivider(graphics, dividerPen, content, y);
                y += 17F;
                graphics.DrawString(FormatCreatedAt(lastTicket.created_at), date, Brushes.Black, new RectangleF(content.Left, y, content.Width, 24F), center);
                y += 25F;
                DrawReceiptTail(graphics, frame, y);
            }
        }

        private void DrawReceiptFrame(Graphics graphics, Pen framePen, Pen thinPen, RectangleF frame)
        {
            if (!DrawTopLeftCornerImage(graphics, frame))
            {
                DrawCornerOrnament(graphics, framePen, frame, false, false);
            }
            if (!DrawTopRightCornerImage(graphics, frame))
            {
                DrawCornerOrnament(graphics, framePen, frame, true, false);
            }
            if (!DrawSideImage(graphics, frame, "left-side.png", false))
            {
                graphics.DrawLine(thinPen, frame.Left + 16F, frame.Top + 52F, frame.Left + 16F, frame.Bottom - 52F);
                DrawSideOrnament(graphics, framePen, frame.Left + 16F, frame.Top + 65F, frame.Bottom - 65F, false);
            }

            if (!DrawSideImage(graphics, frame, "right-side.png", true))
            {
                graphics.DrawLine(thinPen, frame.Right - 16F, frame.Top + 52F, frame.Right - 16F, frame.Bottom - 52F);
                DrawSideOrnament(graphics, framePen, frame.Right - 16F, frame.Top + 65F, frame.Bottom - 65F, true);
            }
        }

        private bool DrawTopLeftCornerImage(Graphics graphics, RectangleF frame)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "left-top.png");
            if (!File.Exists(path))
            {
                return false;
            }

            InterpolationMode oldInterpolationMode = graphics.InterpolationMode;
            PixelOffsetMode oldPixelOffsetMode = graphics.PixelOffsetMode;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            using (Image image = Image.FromFile(path))
            {
                RectangleF target = new RectangleF(frame.Left, frame.Top, 46F, 43F);
                graphics.DrawImage(image, target);
            }

            graphics.InterpolationMode = oldInterpolationMode;
            graphics.PixelOffsetMode = oldPixelOffsetMode;
            return true;
        }

        private bool DrawTopRightCornerImage(Graphics graphics, RectangleF frame)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "right-top.png");
            if (!File.Exists(path))
            {
                return false;
            }

            RectangleF target = new RectangleF(frame.Right - 51F, frame.Top, 43F, 51F);
            DrawReceiptImage(graphics, path, target);
            return true;
        }

        private bool DrawSideImage(Graphics graphics, RectangleF frame, string fileName, bool right)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, fileName);
            if (!File.Exists(path))
            {
                return false;
            }

            float top = frame.Top + 56F;
            float height = Math.Max(80F, frame.Height - 112F);
            float width = 30F;
            float x = right ? frame.Right - width - 8F : frame.Left + 2F;
            RectangleF target = new RectangleF(x, top, width, height);
            DrawReceiptImage(graphics, path, target);
            return true;
        }

        private void DrawReceiptImage(Graphics graphics, string path, RectangleF target)
        {
            InterpolationMode oldInterpolationMode = graphics.InterpolationMode;
            PixelOffsetMode oldPixelOffsetMode = graphics.PixelOffsetMode;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            try
            {
                using (Image image = Image.FromFile(path))
                {
                    graphics.DrawImage(image, target);
                }
            }
            finally
            {
                graphics.InterpolationMode = oldInterpolationMode;
                graphics.PixelOffsetMode = oldPixelOffsetMode;
            }
        }

        private bool DrawReceiptTail(Graphics graphics, RectangleF frame, float y)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tail.png");
            if (!File.Exists(path))
            {
                return false;
            }

            InterpolationMode oldInterpolationMode = graphics.InterpolationMode;
            PixelOffsetMode oldPixelOffsetMode = graphics.PixelOffsetMode;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

            try
            {
                using (Image image = Image.FromFile(path))
                {
                    Rectangle source = new Rectangle(0, 31, image.Width, image.Height - 31);
                    RectangleF target = new RectangleF(frame.Left + 4F, y, frame.Width - 14F, 31F);
                    graphics.DrawImage(image, target, source, GraphicsUnit.Pixel);
                }
            }
            finally
            {
                graphics.InterpolationMode = oldInterpolationMode;
                graphics.PixelOffsetMode = oldPixelOffsetMode;
            }

            return true;
        }

        private bool DrawReceiptLogo(Graphics graphics, RectangleF content, float y, float maxHeight)
        {
            string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "receipt-logo.png");
            if (!File.Exists(path))
            {
                path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.png");
                if (!File.Exists(path))
                {
                    return false;
                }
            }

            using (Image image = Image.FromFile(path))
            {
                InterpolationMode oldInterpolationMode = graphics.InterpolationMode;
                PixelOffsetMode oldPixelOffsetMode = graphics.PixelOffsetMode;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                float ratio = Math.Min(content.Width / image.Width, maxHeight / image.Height);
                float width = image.Width * ratio;
                float height = image.Height * ratio;
                RectangleF target = new RectangleF(
                    content.Left + (content.Width - width) / 2F,
                    y + (maxHeight - height) / 2F,
                    width,
                    height);
                graphics.DrawImage(image, target);

                graphics.InterpolationMode = oldInterpolationMode;
                graphics.PixelOffsetMode = oldPixelOffsetMode;
            }

            return true;
        }

        private void DrawCornerOrnament(Graphics graphics, Pen pen, RectangleF frame, bool right, bool bottom)
        {
            GraphicsState state = graphics.Save();
            graphics.TranslateTransform(right ? frame.Right : frame.Left, bottom ? frame.Bottom : frame.Top);
            graphics.ScaleTransform(right ? -1F : 1F, bottom ? -1F : 1F);

            graphics.DrawLine(pen, 0F, 0F, 42F, 0F);
            graphics.DrawLine(pen, 0F, 0F, 0F, 42F);
            graphics.DrawArc(pen, 5F, 5F, 29F, 29F, 170F, 250F);
            graphics.DrawArc(pen, 21F, 4F, 24F, 24F, 90F, 210F);
            graphics.DrawArc(pen, 4F, 21F, 24F, 24F, 180F, 210F);
            graphics.DrawBezier(pen, new PointF(6F, 34F), new PointF(21F, 31F), new PointF(28F, 21F), new PointF(41F, 16F));
            graphics.FillEllipse(Brushes.Black, 11F, 10F, 4F, 4F);
            graphics.FillEllipse(Brushes.Black, 30F, 30F, 4F, 4F);

            graphics.Restore(state);
        }

        private void DrawSideOrnament(Graphics graphics, Pen pen, float x, float top, float bottom, bool right)
        {
            GraphicsState state = graphics.Save();
            graphics.TranslateTransform(x, 0F);
            graphics.ScaleTransform(right ? -1F : 1F, 1F);

            for (float y = top; y + 31F <= bottom; y += 34F)
            {
                graphics.DrawArc(pen, -11F, y, 22F, 22F, 250F, 220F);
                graphics.DrawArc(pen, 2F, y + 9F, 18F, 18F, 90F, 240F);
                graphics.DrawLine(pen, 0F, y + 25F, 0F, y + 31F);
                graphics.FillEllipse(Brushes.Black, -2F, y + 12F, 4F, 4F);
            }

            graphics.Restore(state);
        }

        private void DrawOrnamentalDivider(Graphics graphics, Pen pen, RectangleF bounds, float y)
        {
            float centerX = bounds.Left + bounds.Width / 2F;
            float ornamentHalf = 27F;
            graphics.DrawLine(pen, bounds.Left, y, centerX - ornamentHalf - 7F, y);
            graphics.DrawLine(pen, centerX + ornamentHalf + 7F, y, bounds.Right, y);
            PointF[] diamond = new PointF[]
            {
                new PointF(centerX, y - 5F),
                new PointF(centerX + 5F, y),
                new PointF(centerX, y + 5F),
                new PointF(centerX - 5F, y),
            };
            graphics.FillPolygon(Brushes.Black, diamond);
            graphics.DrawArc(pen, centerX - 31F, y - 11F, 22F, 22F, 290F, 250F);
            graphics.DrawArc(pen, centerX + 9F, y - 11F, 22F, 22F, 0F, 250F);
            graphics.DrawBezier(pen, new PointF(centerX - 9F, y), new PointF(centerX - 18F, y - 13F), new PointF(centerX - 27F, y + 13F), new PointF(centerX - 38F, y));
            graphics.DrawBezier(pen, new PointF(centerX + 9F, y), new PointF(centerX + 18F, y - 13F), new PointF(centerX + 27F, y + 13F), new PointF(centerX + 38F, y));
        }

        private void DrawCenteredWrapped(Graphics graphics, string valueText, Font font, RectangleF bounds, ref float y)
        {
            string text = String.IsNullOrEmpty(valueText) ? "-" : valueText;
            StringFormat centered = new StringFormat();
            centered.Alignment = StringAlignment.Center;
            SizeF size = graphics.MeasureString(text, font, (int)bounds.Width, centered);
            graphics.DrawString(text, font, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, size.Height + 8F), centered);
            y += size.Height + 8F;
        }

        private Font CreateFittedFont(Graphics graphics, string text, string familyName, float maxSize, FontStyle style, float maxWidth)
        {
            for (float size = maxSize; size >= 24F; size -= 2F)
            {
                Font font = new Font(familyName, size, style);
                if (graphics.MeasureString(text, font).Width <= maxWidth)
                {
                    return font;
                }

                font.Dispose();
            }

            return new Font(familyName, 24F, style);
        }

        private string BuildTicketDetails(TicketItem ticket)
        {
            string text = BuildServiceName(ticket);
            if (!String.IsNullOrEmpty(ticket.educational_program_name))
            {
                text += "\r\n" + BuildProgramName(ticket);
            }
            return text;
        }

        private string BuildServiceName(TicketItem ticket)
        {
            return LocalizedValue(ticket.service_name_kk, ticket.service_name, ticket.service_name_en);
        }

        private string BuildProgramName(TicketItem ticket)
        {
            return LocalizedValue(
                ticket.educational_program_name_kk,
                ticket.educational_program_name,
                ticket.educational_program_name_en);
        }

        private string LocalizedValue(string kazakh, string russian, string english)
        {
            string fallback = !String.IsNullOrEmpty(russian)
                ? russian
                : (!String.IsNullOrEmpty(kazakh) ? kazakh : english);
            string localized = T(kazakh, russian, english);
            return String.IsNullOrEmpty(localized) ? (fallback ?? "-") : localized;
        }

        private string FormatCreatedAt(string value)
        {
            DateTime parsed;
            if (DateTime.TryParse(value, out parsed))
            {
                return parsed.ToLocalTime().ToString("dd.MM.yyyy HH:mm");
            }
            return value ?? "";
        }

        private int MmToHundredthsInch(int millimeters)
        {
            return (int)Math.Round(millimeters / 25.4 * 100.0);
        }

        private void SetBusy(bool isBusy, string message)
        {
            busy = isBusy;
            serviceSelector.Enabled = !busy && serviceCatalog.Count > 0;
            programSelector.Enabled = !busy && programCatalog.Count > 0;
            issueButton.Enabled = !busy && serviceCatalog.Count > 0;
            reloadButton.Enabled = !busy;
            reprintButton.Enabled = !busy && lastTicket != null;
            statusLabel.Text = message;
            UseWaitCursor = busy;
        }

        private void OnUi(MethodInvoker operation)
        {
            if (!IsDisposed)
            {
                BeginInvoke(operation);
            }
        }
    }
}
