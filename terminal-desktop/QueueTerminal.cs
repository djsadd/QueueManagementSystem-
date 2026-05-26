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
        public int ReceiptHeightMm = 150;

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
                else if (key.Equals("ReceiptHeightMm", StringComparison.OrdinalIgnoreCase) && Int32.TryParse(value, out number))
                {
                    config.ReceiptHeightMm = Math.Max(60, number);
                }
            }

            return config;
        }
    }

    internal sealed class ServiceItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string code { get; set; }
        public int priority { get; set; }
        public bool is_active { get; set; }
        public bool requires_educational_program { get; set; }

        public override string ToString()
        {
            return name ?? code ?? id.ToString();
        }
    }

    internal sealed class ProgramItem
    {
        public int id { get; set; }
        public string name { get; set; }
        public string code { get; set; }
        public bool is_active { get; set; }

        public override string ToString()
        {
            return String.IsNullOrEmpty(code) ? name : name + " (" + code + ")";
        }
    }

    internal sealed class TicketItem
    {
        public string id { get; set; }
        public int service_id { get; set; }
        public int? educational_program_id { get; set; }
        public string service_name { get; set; }
        public string educational_program_name { get; set; }
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
        private readonly TerminalConfig config;
        private readonly ApiClient api;
        private readonly ComboBox services = new ComboBox();
        private readonly ComboBox programs = new ComboBox();
        private readonly Label programLabel = new Label();
        private readonly Button issueButton = new Button();
        private readonly Button reloadButton = new Button();
        private readonly Button reprintButton = new Button();
        private readonly Label statusLabel = new Label();
        private readonly Label ticketNumber = new Label();
        private readonly Label ticketDetails = new Label();
        private TicketItem lastTicket;
        private bool busy;

        public TerminalForm(TerminalConfig config)
        {
            this.config = config;
            api = new ApiClient(config.ApiBaseUrl);
            InitializeWindow();
            InitializeLayout();
            Shown += delegate { LoadCatalogs(); };
        }

        private void InitializeWindow()
        {
            Text = "Терминал выдачи талонов";
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
            outer.RowStyles.Add(new RowStyle(SizeType.Absolute, 95F));
            outer.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            Controls.Add(outer);

            Label heading = new Label();
            heading.Text = "Электронная очередь\r\nПолучение талона";
            heading.Font = new Font("Segoe UI", 25F, FontStyle.Bold);
            heading.ForeColor = Color.FromArgb(93, 15, 37);
            heading.AutoSize = true;
            heading.Dock = DockStyle.Fill;
            outer.Controls.Add(heading, 0, 0);
            outer.SetColumnSpan(heading, 2);

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
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 64F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 34F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 64F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
            form.RowStyles.Add(new RowStyle(SizeType.Absolute, 75F));
            form.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            formCard.Controls.Add(form);

            form.Controls.Add(NewLabel("Выберите услугу", 22F, FontStyle.Bold), 0, 0);
            form.Controls.Add(NewLabel("Услуга", 12F, FontStyle.Bold), 0, 1);
            ConfigureSelector(services);
            services.SelectedIndexChanged += delegate { SetProgramVisibility(); };
            form.Controls.Add(services, 0, 2);

            programLabel.Text = "Образовательная программа";
            programLabel.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            programLabel.Dock = DockStyle.Fill;
            form.Controls.Add(programLabel, 0, 3);
            ConfigureSelector(programs);
            form.Controls.Add(programs, 0, 4);

            issueButton.Text = "ПОЛУЧИТЬ ТАЛОН";
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

            result.Controls.Add(NewLabel("ВАШ ТАЛОН", 11F, FontStyle.Bold), 0, 0);
            ticketNumber.Text = "---";
            ticketNumber.Dock = DockStyle.Fill;
            ticketNumber.Font = new Font("Segoe UI", 44F, FontStyle.Bold);
            ticketNumber.ForeColor = Color.FromArgb(93, 15, 37);
            ticketNumber.TextAlign = ContentAlignment.MiddleCenter;
            result.Controls.Add(ticketNumber, 0, 1);

            ticketDetails.Text = "После регистрации номер\r\nбудет распечатан автоматически.";
            ticketDetails.Dock = DockStyle.Fill;
            ticketDetails.TextAlign = ContentAlignment.TopCenter;
            result.Controls.Add(ticketDetails, 0, 2);

            reprintButton.Text = "Повторить печать";
            reprintButton.Dock = DockStyle.Fill;
            reprintButton.Enabled = false;
            reprintButton.Click += delegate { PrintLastTicket(); };
            result.Controls.Add(reprintButton, 0, 4);

            reloadButton.Text = "Обновить список услуг";
            reloadButton.Dock = DockStyle.Fill;
            reloadButton.Click += delegate { LoadCatalogs(); };
            result.Controls.Add(reloadButton, 0, 6);
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
            selector.Font = new Font("Segoe UI", 15F, FontStyle.Regular);
        }

        private void LoadCatalogs()
        {
            SetBusy(true, "Загрузка списка услуг...");
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
                        SetProgramVisibility();
                        SetBusy(false, serviceList.Count == 0 ? "Нет доступных услуг." : "");
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
                statusLabel.Text = "Выберите услугу.";
                return;
            }

            ProgramItem selectedProgram = programs.SelectedItem as ProgramItem;
            if (selectedService.requires_educational_program && selectedProgram == null)
            {
                statusLabel.Text = "Выберите образовательную программу.";
                return;
            }

            int? programId = selectedService.requires_educational_program ? (int?)selectedProgram.id : null;
            SetBusy(true, "Регистрация талона...");
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
                        SetBusy(false, "Талон зарегистрирован. Печать...");
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
                            throw new ApplicationException("Принтер не найден: " + config.PrinterName);
                        }
                    }

                    document.PrintController = new StandardPrintController();
                    document.DocumentName = "Ticket " + lastTicket.ticket_number;
                    document.DefaultPageSettings.Margins = new Margins(12, 12, 8, 8);
                    document.DefaultPageSettings.PaperSize = new PaperSize(
                        "Receipt",
                        MmToHundredthsInch(config.ReceiptWidthMm),
                        MmToHundredthsInch(config.ReceiptHeightMm));
                    document.PrintPage += DrawReceipt;
                    document.Print();
                    statusLabel.Text = "Талон " + lastTicket.ticket_number + " отправлен на печать.";
                }
            }
            catch (Exception exception)
            {
                statusLabel.Text = "Талон создан, но печать не выполнена: " + exception.Message;
            }
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
                graphics.DrawString("Ваш талон", small, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 22), center);
                y += 23;
                graphics.DrawString(lastTicket.ticket_number, number, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 55), center);
                y += 62;
                graphics.DrawLine(Pens.Black, bounds.Left, y, bounds.Right, y);
                y += 12;
                DrawCenteredWrapped(graphics, lastTicket.service_name, value, bounds, ref y);

                if (!String.IsNullOrEmpty(lastTicket.educational_program_name))
                {
                    y += 5;
                    DrawCenteredWrapped(graphics, lastTicket.educational_program_name, small, bounds, ref y);
                }

                y += 14;
                graphics.DrawLine(Pens.Black, bounds.Left, y, bounds.Right, y);
                y += 10;
                graphics.DrawString(FormatCreatedAt(lastTicket.created_at), small, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, 22), center);
            }
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
            string text = String.IsNullOrEmpty(ticket.service_name) ? "" : ticket.service_name;
            if (!String.IsNullOrEmpty(ticket.educational_program_name))
            {
                text += "\r\n" + ticket.educational_program_name;
            }
            return text;
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
