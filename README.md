# Dự án kết thúc môn

Đây là thư mục dự án kết thúc môn của sinh viên. Dự án được tổ chức theo cấu trúc rõ ràng nhằm phục vụ quá trình phát triển website, quản lý mã nguồn và nộp sản phẩm cuối kỳ.

## 1. Cấu trúc thư mục dự án

```text
.
├── .git/
├── assets/
│   └── thesis/
│       └── template_thesis.dotx
├── css/
├── html/
├── js/
├── index.html
└── README.md
```

## 2. Mô tả các thư mục và tập tin

### `.git/`

Thư mục quản lý mã nguồn của Git. Thư mục này được tạo tự động khi dự án được khởi tạo hoặc clone từ GitHub.


---

### `assets/`

Thư mục dùng để lưu trữ các tài nguyên dùng chung cho dự án, ví dụ:

- Hình ảnh
- Biểu tượng
- Tài liệu
- Mẫu báo cáo
- Các tập tin hỗ trợ khác

---

### `css/`

Thư mục chứa các tập tin định dạng giao diện website.

Ví dụ:

```text
css/style.css
css/responsive.css
```

Các tập tin trong thư mục này dùng để thiết kế bố cục, màu sắc, font chữ, khoảng cách, hiệu ứng hiển thị và khả năng tương thích trên các thiết bị khác nhau.

---

### `html/`

Thư mục chứa các trang HTML thành phần của website.

Ví dụ:

```text
html/about.html
html/contact.html
html/product.html
```

Các trang HTML trong thư mục này được sử dụng để xây dựng các nội dung riêng biệt của website ngoài trang chính `index.html`.

---

### `js/`

Thư mục chứa các tập tin JavaScript dùng để xử lý tương tác trên website.

Ví dụ:

```text
js/main.js
js/validation.js
```

Các tập tin JavaScript có thể dùng để:

- Xử lý sự kiện người dùng
- Kiểm tra dữ liệu nhập
- Tạo hiệu ứng tương tác
- Thao tác với DOM
- Điều khiển các thành phần động trên website

---

### `index.html`

Đây là tập tin trang chủ của website.

Khi bật GitHub Pages, tập tin `index.html` sẽ là trang mặc định được hiển thị đầu tiên khi người dùng truy cập vào website.