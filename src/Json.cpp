#include "Json.h"

#include <cstddef>

namespace json
{
    bool ExtractString(const std::string& text, const char* key, std::string& out)
    {
        std::string needle = "\"";
        needle += key;
        needle += "\"";

        const std::size_t keyPos = text.find(needle);
        if (keyPos == std::string::npos)
        {
            return false;
        }

        std::size_t pos = text.find(':', keyPos + needle.size());
        if (pos == std::string::npos)
        {
            return false;
        }

        ++pos;
        while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t'))
        {
            ++pos;
        }

        if (pos >= text.size() || text[pos] != '"')
        {
            return false;
        }

        ++pos;
        out.clear();
        while (pos < text.size())
        {
            const char c = text[pos];
            if (c == '"')
            {
                return true;
            }

            if (c == '\\' && pos + 1 < text.size())
            {
                const char next = text[pos + 1];
                switch (next)
                {
                case '"': out += '"'; break;
                case '\\': out += '\\'; break;
                case '/': out += '/'; break;
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case 'r': out += '\r'; break;
                case 'b': out += '\b'; break;
                case 'f': out += '\f'; break;
                default: out += next; break;
                }
                pos += 2;

                continue;
            }

            out += c;
            ++pos;
        }

        return false;
    }

    bool ExtractInt(const std::string& text, const char* key, int& out)
    {
        std::string needle = "\"";
        needle += key;
        needle += "\"";

        const std::size_t keyPos = text.find(needle);
        if (keyPos == std::string::npos)
        {
            return false;
        }

        std::size_t pos = text.find(':', keyPos + needle.size());
        if (pos == std::string::npos)
        {
            return false;
        }

        ++pos;
        while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t'))
        {
            ++pos;
        }

        int sign = 1;
        if (pos < text.size() && text[pos] == '-')
        {
            sign = -1;
            ++pos;
        }

        bool any = false;
        int value = 0;
        while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9')
        {
            value = value * 10 + (text[pos] - '0');
            any = true;
            ++pos;
        }

        if (!any)
        {
            return false;
        }

        out = sign * value;

        return true;
    }

    std::string Escape(const char* buffer, const unsigned int size)
    {
        std::string escaped;
        escaped.reserve(size + 16);
        for (unsigned int i = 0; i < size; ++i)
        {
            const char c = buffer[i];
            switch (c)
            {
            case '"': escaped += "\\\""; break;
            case '\\': escaped += "\\\\"; break;
            case '\n': escaped += "\\n"; break;
            case '\t': escaped += "\\t"; break;
            case '\r': escaped += "\\r"; break;
            case '\b': escaped += "\\b"; break;
            case '\f': escaped += "\\f"; break;
            default: escaped += c; break;
            }
        }

        return escaped;
    }

    std::string Escape(const std::string& value)
    {
        return Escape(value.c_str(), static_cast<unsigned int>(value.size()));
    }
}
