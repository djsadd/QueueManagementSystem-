using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Printing;
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
        public string ApiBaseUrl = "http://localhost:8000";
        public string PrinterName = "";
        public bool FullScreen = true;
        public int ReceiptWidthMm = 80;
        public int ReceiptBottomFeedMm = 5;
        public string OnlineQrImage = "online-qr.png";

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
                else if (key.Equals("OnlineQrImage", StringComparison.OrdinalIgnoreCase))
                {
                    config.OnlineQrImage = value;
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
            string value = display_name ?? name;
            return String.IsNullOrEmpty(code) ? value : value + " (" + code + ")";
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
        private readonly ComboBox services = new ComboBox();
        private readonly ComboBox programs = new ComboBox();
        private readonly Label programLabel = new Label();
        private readonly Button issueButton = new Button();
        private readonly Button reloadButton = new Button();
        private readonly Button reprintButton = new Button();
        private readonly Label statusLabel = new Label();
        private readonly Label resultLabel = new Label();
        private readonly Label ticketNumber = new Label();
        private readonly Label ticketDetails = new Label();
        private readonly Label onlineAppointmentLabel = new Label();
        private readonly PictureBox onlineQrCode = new PictureBox();
        private readonly System.Windows.Forms.Timer clockTimer = new System.Windows.Forms.Timer();
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

            TableLayoutPanel form = new TableLayoutPanel();
            form.Dock = DockStyle.Fill;
            form.Padding = new Padding(30);
            form.ColumnCount = 1;
            form.RowCount = 8;
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 48F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 78F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 78F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 75F));
            form.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            formCard.Controls.Add(form);

            formTitle.Dock = DockStyle.Fill;
            formTitle.Font = new Font("Segoe UI", 22F, FontStyle.Bold);
            formTitle.ForeColor = Color.FromArgb(40, 21, 26);
            form.Controls.Add(formTitle, 0, 0);
            serviceLabel.Dock = DockStyle.Fill;
            serviceLabel.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            form.Controls.Add(serviceLabel, 0, 1);
            ConfigureSelector(services);
            services.SelectedIndexChanged += delegate { SetProgramVisibility(); };
            form.Controls.Add(services, 0, 2);

            programLabel.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            programLabel.Dock = DockStyle.Fill;
            form.Controls.Add(programLabel, 0, 3);
            ConfigureSelector(programs);
            form.Controls.Add(programs, 0, 4);

            issueButton.Dock = DockStyle.Fill;
            issueButton.FlatStyle = FlatStyle.Flat;
            issueButton.FlatAppearance.BorderSize = 0;
            issueButton.BackColor = Color.FromArgb(122, 22, 49);
            issueButton.ForeColor = Color.White;
            issueButton.Font = new Font("Segoe UI", 19F, FontStyle.Bold);
            issueButton.Click += delegate { CreateTicket(); };
            form.Controls.Add(issueButton, 0, 6);

            statusLabel.Dock = DockStyle.Fill;
            statusLabel.ForeColor = Color.FromArgb(122, 22, 49);
            statusLabel.Padding = new Padding(0, 16, 0, 0);
            statusLabel.AutoSize = true;
            form.Controls.Add(statusLabel, 0, 7);

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

            TableLayoutPanel onlineAppointment = new TableLayoutPanel();
            onlineAppointment.Dock = DockStyle.Fill;
            onlineAppointment.ColumnCount = 1;
            onlineAppointment.RowCount = 2;
            onlineAppointment.RowStyles.Add(new RowStyle(SizeType.Absolute, 60F));
            onlineAppointment.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            onlineAppointment.Margin = new Padding(0, 6, 0, 12);
            result.Controls.Add(onlineAppointment, 0, 3);

            onlineAppointmentLabel.Dock = DockStyle.Fill;
            onlineAppointmentLabel.TextAlign = ContentAlignment.MiddleCenter;
            onlineAppointmentLabel.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            onlineAppointmentLabel.ForeColor = Color.FromArgb(93, 15, 37);
            onlineAppointment.Controls.Add(onlineAppointmentLabel, 0, 0);

            onlineQrCode.Dock = DockStyle.Fill;
            onlineQrCode.SizeMode = PictureBoxSizeMode.Zoom;
            onlineQrCode.Margin = new Padding(16, 0, 16, 0);
            LoadOnlineQrCode();
            onlineAppointment.Controls.Add(onlineQrCode, 0, 1);

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

        private void LoadOnlineQrCode()
        {
            string path = GetOnlineQrPath();
            if (!File.Exists(path))
            {
                return;
            }

            using (Image source = Image.FromFile(path))
            {
                onlineQrCode.Image = new Bitmap(source);
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

        private void ConfigureSelector(ComboBox selector)
        {
            selector.Dock = DockStyle.Fill;
            selector.DropDownStyle = ComboBoxStyle.DropDownList;
            selector.DrawMode = DrawMode.OwnerDrawVariable;
            selector.IntegralHeight = false;
            selector.DropDownHeight = 390;
            selector.ItemHeight = 64;
            selector.Font = new Font("Segoe UI", 14F, FontStyle.Regular);
            selector.BackColor = Color.White;
            selector.MeasureItem += MeasureSelectorItem;
            selector.DrawItem += DrawSelectorItem;
        }

        private void MeasureSelectorItem(object sender, MeasureItemEventArgs e)
        {
            ComboBox selector = sender as ComboBox;
            if (selector == null || e.Index < 0)
            {
                e.ItemHeight = 64;
                return;
            }

            string text = Convert.ToString(selector.Items[e.Index]);
            int width = Math.Max(180, selector.DropDownWidth - 34);
            SizeF size = e.Graphics.MeasureString(text, selector.Font, width);
            e.ItemHeight = Math.Max(64, Math.Min(108, (int)Math.Ceiling(size.Height) + 18));
        }

        private void DrawSelectorItem(object sender, DrawItemEventArgs e)
        {
            ComboBox selector = sender as ComboBox;
            if (selector == null || e.Index < 0)
            {
                return;
            }

            e.DrawBackground();
            Rectangle bounds = new Rectangle(e.Bounds.Left + 10, e.Bounds.Top + 5, e.Bounds.Width - 30, e.Bounds.Height - 10);
            string text = Convert.ToString(selector.Items[e.Index]);
            Color color = (e.State & DrawItemState.Selected) == DrawItemState.Selected
                ? SystemColors.HighlightText
                : Color.FromArgb(40, 21, 26);
            TextRenderer.DrawText(
                e.Graphics,
                text,
                selector.Font,
                bounds,
                color,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
            e.DrawFocusRectangle();
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
            onlineAppointmentLabel.Text = BuildOnlineAppointmentMessage();
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
            ServiceItem selectedService = services.SelectedItem as ServiceItem;
            ProgramItem selectedProgram = programs.SelectedItem as ProgramItem;
            List<ServiceItem> serviceList = services.DataSource as List<ServiceItem>;
            List<ProgramItem> programList = programs.DataSource as List<ProgramItem>;

            if (serviceList != null)
            {
                foreach (ServiceItem item in serviceList)
                {
                    item.display_name = LocalizedValue(item.name_kk, item.name, item.name_en);
                }

                services.BeginUpdate();
                services.DataSource = null;
                services.DataSource = serviceList;
                services.SelectedItem = selectedService;
                services.EndUpdate();
            }

            if (programList != null)
            {
                foreach (ProgramItem item in programList)
                {
                    item.display_name = LocalizedValue(item.name_kk, item.name, item.name_en);
                }

                programs.BeginUpdate();
                programs.DataSource = null;
                programs.DataSource = programList;
                programs.SelectedItem = selectedProgram;
                programs.EndUpdate();
            }

            SetProgramVisibility();
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
                        services.DataSource = serviceList;
                        programs.DataSource = programList;
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
            ServiceItem selected = services.SelectedItem as ServiceItem;
            bool required = selected != null && selected.requires_educational_program;
            programLabel.Visible = required;
            programs.Visible = required;
        }

        private void CreateTicket()
        {
            ServiceItem selectedService = services.SelectedItem as ServiceItem;
            if (selectedService == null)
            {
                statusLabel.Text = T("Қызметті таңдаңыз.", "Выберите услугу.", "Select a service.");
                return;
            }

            ProgramItem selectedProgram = programs.SelectedItem as ProgramItem;
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
                    document.DefaultPageSettings.Margins = new Margins(12, 12, 8, 8);
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

        private int GetReceiptHeight()
        {
            float height = 194F;
            int width = MmToHundredthsInch(config.ReceiptWidthMm) - 24;

            using (Bitmap bitmap = new Bitmap(1, 1))
            using (Graphics graphics = Graphics.FromImage(bitmap))
            using (Font value = new Font("Arial", 10F, FontStyle.Bold))
            using (Font small = new Font("Arial", 9F, FontStyle.Regular))
            {
                graphics.PageUnit = GraphicsUnit.Display;
                height += graphics.MeasureString(BuildServiceName(lastTicket), value, width).Height + 4F;
                if (!String.IsNullOrEmpty(lastTicket.educational_program_name))
                {
                    height += 5F + graphics.MeasureString(BuildProgramName(lastTicket), small, width).Height + 4F;
                }
            }

            height += MmToHundredthsInch(config.ReceiptBottomFeedMm);
            return (int)Math.Ceiling(height);
        }

        private void DrawReceipt(object sender, PrintPageEventArgs args)
        {
            Graphics graphics = args.Graphics;
            RectangleF bounds = new RectangleF(
                args.MarginBounds.Left,
                args.MarginBounds.Top,
                args.MarginBounds.Width,
                args.MarginBounds.Height);
            StringFormat center = new StringFormat();
            center.Alignment = StringAlignment.Center;
            float y = bounds.Top;

            using (Font organization = new Font("Arial", 11F, FontStyle.Bold))
            using (Font small = new Font("Arial", 9F, FontStyle.Regular))
            using (Font number = new Font("Arial", 35F, FontStyle.Bold))
            using (Font value = new Font("Arial", 10F, FontStyle.Bold))
            {
                graphics.DrawString("TURAN ASTANA UNIVERSITY", organization, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 32), center);
                y += 38;
                graphics.DrawString(T("Сіздің талоныңыз", "Ваш талон", "Your ticket"), small, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 22), center);
                y += 23;
                graphics.DrawString(lastTicket.ticket_number, number, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 55), center);
                y += 62;
                graphics.DrawLine(Pens.Black, bounds.Left, y, bounds.Right, y);
                y += 12;
                DrawCenteredWrapped(graphics, BuildServiceName(lastTicket), value, bounds, ref y);

                if (!String.IsNullOrEmpty(lastTicket.educational_program_name))
                {
                    y += 5;
                    DrawCenteredWrapped(graphics, BuildProgramName(lastTicket), small, bounds, ref y);
                }

                y += 14;
                graphics.DrawLine(Pens.Black, bounds.Left, y, bounds.Right, y);
                y += 10;
                graphics.DrawString(FormatCreatedAt(lastTicket.created_at), small, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 22), center);
            }
        }

        private string BuildOnlineAppointmentMessage()
        {
            return T(
                "QR-кодты сканерлеп,\r\nонлайн жазыла аласыз",
                "Можете записаться онлайн,\r\nотсканировав QR-код",
                "Book online by scanning\r\nthe QR code");
        }

        private string GetOnlineQrPath()
        {
            if (String.IsNullOrWhiteSpace(config.OnlineQrImage))
            {
                return "";
            }

            if (Path.IsPathRooted(config.OnlineQrImage))
            {
                return config.OnlineQrImage;
            }

            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, config.OnlineQrImage);
        }

        private void DrawCenteredWrapped(Graphics graphics, string valueText, Font font, RectangleF bounds, ref float y)
        {
            string text = String.IsNullOrEmpty(valueText) ? "-" : valueText;
            StringFormat centered = new StringFormat();
            centered.Alignment = StringAlignment.Center;
            SizeF size = graphics.MeasureString(text, font, (int)bounds.Width, centered);
            graphics.DrawString(text, font, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, size.Height + 4), centered);
            y += size.Height + 4;
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
            services.Enabled = !busy;
            programs.Enabled = !busy;
            issueButton.Enabled = !busy && services.Items.Count > 0;
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
